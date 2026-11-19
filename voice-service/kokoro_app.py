"""Optional, private Kokoro audition worker; never a default or an automatic fallback."""

import asyncio
import hashlib
import io
import os
import secrets
import wave
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Header, HTTPException, Request, Response
from app import Speech, SpeechWorker


def verified_assets() -> Path:
    if os.environ.get("KOKORO_RIGHTS_APPROVED") != "true":
        raise RuntimeError(
            "Review the model, voice assets, runtime and phonemizer licences first."
        )
    model = Path(os.environ["KOKORO_MODEL_PATH"])
    voices = Path(os.environ["KOKORO_VOICES_PATH"])
    for path, key in ((model, "KOKORO_MODEL_SHA256"), (voices, "KOKORO_VOICES_SHA256")):
        expected = os.environ.get(key, "")
        with path.open("rb") as source:
            digest = hashlib.file_digest(source, "sha256").hexdigest()
        if len(expected) != 64 or not secrets.compare_digest(digest, expected):
            raise RuntimeError("Kokoro asset verification failed.")
    return model


def kokoro_worker(pipe, model_path):
    import numpy as np
    import onnxruntime as ort
    from kokoro_onnx import Kokoro

    options = ort.SessionOptions()
    options.intra_op_num_threads = 2
    options.inter_op_num_threads = 1
    session = ort.InferenceSession(
        model_path, sess_options=options, providers=["CPUExecutionProvider"]
    )
    model = Kokoro.from_session(session, os.environ["KOKORO_VOICES_PATH"])
    # Fixed British English audition voice. Do not accept a model/voice URL from callers.
    voice = "bf_emma"
    if voice not in model.voices:
        raise RuntimeError("The approved audition voice is absent from this pack.")
    pipe.send_bytes(b"ready")
    while True:
        text = pipe.recv_bytes(4096).decode("utf-8")
        samples, rate = model.create(text, voice=voice, speed=1.0, lang="en-gb")
        if (
            not len(samples)
            or len(samples) > rate * 80
            or not np.isfinite(samples).all()
        ):
            pipe.send_bytes(b"error")
            continue
        output = io.BytesIO()
        with wave.open(output, "wb") as audio:
            audio.setnchannels(1)
            audio.setsampwidth(2)
            audio.setframerate(rate)
            audio.writeframes((np.clip(samples, -1, 1) * 32767).astype("<i2").tobytes())
        data = output.getvalue()
        pipe.send_bytes(data if len(data) <= 4_000_000 else b"error")


@asynccontextmanager
async def lifespan(app):
    token = os.environ.get("KOKORO_SERVICE_TOKEN", "")
    if len(token) < 32:
        raise RuntimeError("Configure a strong private service token.")
    speech = SpeechWorker(verified_assets(), worker_target=kokoro_worker)
    await speech.start()
    app.state.speech, app.state.token = speech, token
    try:
        yield
    finally:
        speech.stop()


app = FastAPI(lifespan=lifespan, docs_url=None, redoc_url=None, openapi_url=None)


@app.get("/health")
async def health():
    if not app.state.speech.process or not app.state.speech.process.is_alive():
        raise HTTPException(503, "Speech unavailable")
    return {"voice": "kokoro-bf_emma", "ready": True}


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
