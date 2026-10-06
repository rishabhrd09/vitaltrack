"""Private, single-worker Alba service. No voice model is shipped in this repository."""

import asyncio
import hashlib
import io
import multiprocessing as mp
import os
import secrets
import wave
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Header, HTTPException, Request, Response
from pydantic import BaseModel, ConfigDict, Field


def verified_model() -> Path:
    if os.environ.get("ALBA_RIGHTS_APPROVED") != "true":
        raise RuntimeError(
            "Complete the model/runtime rights review before starting speech."
        )
    path = Path(os.environ["ALBA_MODEL_PATH"])
    if path.name != "en_GB-alba-medium.onnx":
        raise RuntimeError("Only the approved Alba voice is supported.")
    for file, setting in (
        (path, "ALBA_MODEL_SHA256"),
        (Path(str(path) + ".json"), "ALBA_CONFIG_SHA256"),
    ):
        expected = os.environ.get(setting, "")
        with file.open("rb") as stream:
            actual = hashlib.file_digest(stream, "sha256").hexdigest()
        if len(expected) != 64 or not secrets.compare_digest(expected, actual):
            raise RuntimeError("Alba model/configuration verification failed.")
    return path


def worker(pipe, path):
    # Import/load only in the isolated process. Never fall back to another voice.
    from piper import PiperVoice

    voice = PiperVoice.load(path)
    pipe.send_bytes(b"ready")
    while True:
        text = pipe.recv_bytes(4096).decode("utf-8")
        output = io.BytesIO()
        with wave.open(output, "wb") as audio:
            voice.synthesize_wav(text, audio)
        data = output.getvalue()
        pipe.send_bytes(data if len(data) <= 4_000_000 else b"error")


class SpeechWorker:
    def __init__(self, path, worker_target=worker):
        self.path, self.process, self.pipe = path, None, None
        self.worker_target = worker_target
        self.lock = asyncio.Lock()

    def stop(self):
        if self.process:
            self.process.terminate()
            self.process.join(timeout=1)
            if self.process.is_alive():
                self.process.kill()
                self.process.join(timeout=1)
        if self.pipe:
            self.pipe.close()
        self.process = self.pipe = None

    async def receive(self, timeout):
        deadline = asyncio.get_running_loop().time() + timeout
        while asyncio.get_running_loop().time() < deadline:
            if self.pipe.poll():
                return self.pipe.recv_bytes(4_000_000)
            if not self.process.is_alive():
                raise RuntimeError("Speech worker unavailable")
            await asyncio.sleep(0.02)
        raise TimeoutError()

    async def start(self):
        context = mp.get_context("spawn")
        self.pipe, child = context.Pipe()
        self.process = context.Process(
            target=self.worker_target, args=(child, str(self.path)), daemon=True
        )
        self.process.start()
        child.close()
        try:
            if await self.receive(30) != b"ready":
                raise RuntimeError("Speech worker failed to start")
        except BaseException:
            self.stop()
            raise

    async def synthesize(self, text):
        if self.lock.locked():
            raise HTTPException(429, "Speech worker busy")
        async with self.lock:
            if not self.process or not self.process.is_alive():
                # Fail closed. The service supervisor can restart a failed worker.
                raise HTTPException(503, "Speech worker unavailable")
            try:
                self.pipe.send_bytes(text.encode("utf-8"))
                data = await self.receive(20)
                if data[:4] != b"RIFF":
                    raise ValueError()
                return data
            except BaseException:
                self.stop()
                raise HTTPException(503, "Speech generation failed") from None


@asynccontextmanager
async def lifespan(app):
    token = os.environ.get("PIPER_SERVICE_TOKEN", "")
    if len(token) < 32:
        raise RuntimeError("Set a strong service-to-service token.")
    speech = SpeechWorker(verified_model())
    await speech.start()
    app.state.speech = speech
    app.state.token = token
    try:
        yield
    finally:
        speech.stop()


app = FastAPI(lifespan=lifespan, docs_url=None, redoc_url=None, openapi_url=None)


class Speech(BaseModel):
    model_config = ConfigDict(extra="forbid")
    text: str = Field(min_length=1, max_length=640)


@app.get("/health")
async def health():
    if not app.state.speech.process or not app.state.speech.process.is_alive():
        raise HTTPException(503, "Speech unavailable")
    return {"voice": "en_GB-alba-medium", "ready": True}


@app.post("/synthesize")
async def synthesize(request: Request, authorization: str = Header("")):
    if not secrets.compare_digest(authorization, "Bearer " + app.state.token):
        raise HTTPException(401, "Unauthorized")
    body = bytearray()
    try:
        async with asyncio.timeout(5):
            async for chunk in request.stream():
                body.extend(chunk)
                if len(body) > 8000:
                    raise HTTPException(413, "Request too large")
    except TimeoutError:
        raise HTTPException(408, "Request timed out") from None
    try:
        message = Speech.model_validate_json(body)
    except ValueError:
        raise HTTPException(422, "Invalid speech request") from None
    audio = await app.state.speech.synthesize(message.text)
    return Response(
        audio, media_type="audio/wav", headers={"Cache-Control": "no-store"}
    )
