"""No voice weights or provider requests: service transport and asset gates only."""
import hashlib

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

import kokoro_app


def test_assets_require_approval_and_matching_hashes(monkeypatch, tmp_path):
    model, voices = tmp_path / "model.onnx", tmp_path / "voices.bin"
    model.write_bytes(b"synthetic model placeholder")
    voices.write_bytes(b"synthetic voice placeholder")
    monkeypatch.setenv("KOKORO_MODEL_PATH", str(model))
    monkeypatch.setenv("KOKORO_VOICES_PATH", str(voices))
    monkeypatch.setenv("KOKORO_MODEL_SHA256", hashlib.sha256(model.read_bytes()).hexdigest())
    monkeypatch.setenv("KOKORO_VOICES_SHA256", hashlib.sha256(voices.read_bytes()).hexdigest())
    monkeypatch.setenv("KOKORO_RIGHTS_APPROVED", "false")
    with pytest.raises(RuntimeError):
        kokoro_app.verified_assets()
    monkeypatch.setenv("KOKORO_RIGHTS_APPROVED", "true")
    assert kokoro_app.verified_assets() == model
    monkeypatch.setenv("KOKORO_MODEL_SHA256", "0" * 64)
    with pytest.raises(RuntimeError):
        kokoro_app.verified_assets()


@pytest.fixture
def client(monkeypatch, tmp_path):
    class FakeWorker:
        process = type("Process", (), {"is_alive": lambda self: True})()
        def __init__(self, *args, **kwargs):
            assert kwargs["worker_target"] is kokoro_app.kokoro_worker
        async def start(self):
            pass
        def stop(self):
            pass
        async def synthesize(self, text):
            if text == "fail":
                raise HTTPException(503, "Speech generation failed")
            return b"RIFFsynthetic-WAVE"
    monkeypatch.setattr(kokoro_app, "SpeechWorker", FakeWorker)
    monkeypatch.setattr(kokoro_app, "verified_assets", lambda: tmp_path / "fake.onnx")
    monkeypatch.setenv("KOKORO_SERVICE_TOKEN", "x" * 32)
    with TestClient(kokoro_app.app) as client:
        yield client


def test_kokoro_transport_requires_token_and_has_no_fallback(client):
    assert client.get("/health").json()["voice"] == "kokoro-bf_emma"
    assert client.post("/synthesize", json={"text": "hello"}).status_code == 401
    headers = {"Authorization": "Bearer " + "x" * 32}
    response = client.post("/synthesize", headers=headers, json={"text": "Synthetic stock"})
    assert response.status_code == 200 and response.headers["cache-control"] == "no-store"
    assert client.post("/synthesize", headers=headers, json={"text": "fail"}).status_code == 503


@pytest.mark.parametrize("payload,status", [({"text": "x" * 641}, 422), ({"text": "hi", "voice": "other"}, 422), ({"text": "x" * 9000}, 413)])
def test_kokoro_bounds_input(client, payload, status):
    assert client.post("/synthesize", headers={"Authorization": "Bearer " + "x" * 32}, json=payload).status_code == status
