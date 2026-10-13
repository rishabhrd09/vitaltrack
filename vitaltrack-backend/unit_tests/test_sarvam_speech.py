"""No database or live provider is used. Synthetic narration and HTTP contracts."""

import base64
import io
import json
import wave

import pytest
from fastapi import HTTPException
from pydantic import SecretStr, ValidationError

from app.core.config import settings
from app.schemas.ai import SpeakRequest, CONSENT_VERSION
from app.services import ai_guard, ai_provider
from app.api.v1 import ai


@pytest.fixture(autouse=True)
def speech_settings(monkeypatch):
    for key, value in {
        "AI_ENABLED": True,
        "AI_SPEECH_ENABLED": True,
        "AI_TRANSCRIBE_ENABLED": True,
        "AI_SARVAM_ENABLED": True,
        "AI_SARVAM_TRANSCRIBE_ENABLED": False,
        "AI_SARVAM_DATA_CONTROLS_REVIEWED": True,
        "SARVAM_API_KEY": SecretStr("synthetic-key"),
        "SARVAM_TTS_MODEL": "bulbul:v3",
        "SARVAM_SPEAKER": "",
        "GROQ_API_KEY": SecretStr(""),
        "AI_KOKORO_ENABLED": False,
        "AI_ALBA_RIGHTS_APPROVED": False,
    }.items():
        monkeypatch.setattr(settings, key, value)


def clip():
    out = io.BytesIO()
    with wave.open(out, "wb") as audio:
        audio.setparams((1, 2, 24000, 0, "NONE", "not compressed"))
        audio.writeframes(b"\x10\x01" * 2400)
    return out.getvalue()


@pytest.mark.parametrize(
    "model,speaker",
    [
        ("bulbul:v3", "ritu"),
        ("bulbul:v4-flash", "aparna_en_companion"),
    ],
)
async def test_model_switch_uses_correct_english_voice(monkeypatch, model, speaker):
    monkeypatch.setattr(settings, "SARVAM_TTS_MODEL", model)
    called = []

    async def transport(url, headers, **kwargs):
        called.append((url, headers, kwargs))
        return json.dumps({"audios": [base64.b64encode(clip()).decode()]}).encode()

    monkeypatch.setattr(ai_provider, "bounded_call", transport)
    assert (
        await ai_provider.selected_speech("There are 18 pairs.", "sarvam", 0.9)
        == clip()
    )
    assert len(called) == 1
    url, headers, kwargs = called[0]
    assert url == "https://api.sarvam.ai/text-to-speech"
    assert headers == {"api-subscription-key": "synthetic-key"}
    assert kwargs["json"] == {
        "model": model,
        "speaker": speaker,
        "language_code": "en-IN",
        "text": "There are 18 pairs.",
        "pace": 0.9,
        "temperature": 0.3,
        "speech_sample_rate": 24000,
        "output_audio_codec": "wav",
    }


@pytest.mark.parametrize(
    "model,speaker",
    [
        ("bulbul:v3", "aparna_en_companion"),
        ("bulbul:v4-flash", "ritu"),
        ("bulbul:v4-flash", "aparna_hi_customer"),
        ("unknown", ""),
    ],
)
async def test_wrong_voice_model_or_language_never_contacts_provider(
    monkeypatch, model, speaker
):
    monkeypatch.setattr(settings, "SARVAM_TTS_MODEL", model)
    monkeypatch.setattr(settings, "SARVAM_SPEAKER", speaker)

    async def forbidden(*args, **kwargs):
        raise AssertionError("No billable request for invalid configuration")

    monkeypatch.setattr(ai_provider, "bounded_call", forbidden)
    with pytest.raises(HTTPException) as failure:
        await ai_provider.selected_speech("Synthetic answer", "sarvam")
    assert failure.value.status_code == 503
    with pytest.raises(HTTPException):
        ai_guard.require_enabled("speak", "sarvam")


def test_speech_flags_do_not_enable_sarvam_listening():
    ai_guard.require_enabled("speak", "sarvam")
    with pytest.raises(HTTPException) as failure:
        ai_guard.require_enabled("transcribe", "sarvam")
    assert failure.value.status_code == 503
    assert ai_guard.consent_scope("speak", "sarvam") == "sarvam_speech"
    assert ai_guard.consent_scope("transcribe", "sarvam") == "sarvam_audio"


@pytest.mark.parametrize(
    "field,value",
    [
        ("pace", True),
        ("pace", 0.95),
        ("pace", 2),
        ("text", "x" * 641),
        ("language", "hi-IN"),
        ("speaker", "untrusted"),
        ("api_key", "untrusted"),
    ],
)
def test_client_cannot_change_credentials_language_voice_or_limits(field, value):
    with pytest.raises(ValidationError):
        SpeakRequest.model_validate(
            {"text": "Synthetic", "provider": "sarvam", field: value}
        )


@pytest.mark.parametrize(
    "raw",
    [b"null", b"{}", b'{"audios":[]}', b'{"audios":["bad!"]}', b'{"audios":["YWJj"]}'],
)
async def test_invalid_audio_is_rejected_without_fallback(monkeypatch, raw):
    calls = []

    async def transport(*args, **kwargs):
        calls.append(args[0])
        return raw

    monkeypatch.setattr(ai_provider, "bounded_call", transport)
    with pytest.raises(HTTPException):
        await ai_provider.selected_speech("Synthetic", "sarvam")
    assert len(calls) == 1


async def test_capabilities_advertise_sarvam_without_legacy_alba(monkeypatch):
    class FakeDb:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            pass

        async def get(self, *args):
            return None

    monkeypatch.setattr(ai, "AsyncSessionLocal", FakeDb)
    from app.services import sarvam_credentials

    monkeypatch.setattr(sarvam_credentials, "AsyncSessionLocal", FakeDb)
    available = await ai.capabilities(ai_guard.AIPrincipal("synthetic-user"))
    assert available["speak"] is True
    assert available["speech_providers"] == ["sarvam"]
    assert available["transcription_providers"] == []
    assert available["sarvam_english_voice"]["speaker"] == "ritu"
    assert available["voice"] == "ritu"
    assert available["scopes"] == []
    assert available["consent_version"] == CONSENT_VERSION


async def test_api_speech_passes_pace_returns_wav_and_settles_usage(monkeypatch):
    events = []

    async def reserve(owner, kind, **kwargs):
        events.append(("reserve", owner, kind, kwargs))
        return "ticket"

    async def speech(text, provider, pace):
        events.append(("speech", text, provider, pace))
        return clip()

    async def settle(ticket, success):
        events.append(("settle", ticket, success))

    monkeypatch.setattr(ai, "reserve", reserve)
    monkeypatch.setattr(ai_provider, "selected_speech", speech)
    monkeypatch.setattr(ai, "settle", settle)
    result = await ai.speak(
        SpeakRequest(text="Synthetic", provider="sarvam", pace=1.1),
        ai_guard.AIPrincipal("synthetic-user"),
    )
    assert result.body == clip() and result.media_type == "audio/wav"
    assert result.headers["cache-control"] == "no-store"
    assert events == [
        (
            "reserve",
            "synthetic-user",
            "speak",
            {"provider": "sarvam", "credential_source": "application"},
        ),
        ("speech", "Synthetic", "sarvam", 1.1),
        ("settle", "ticket", True),
    ]


async def test_valid_but_silent_wav_is_not_reported_as_speech(monkeypatch):
    out = io.BytesIO()
    with wave.open(out, "wb") as audio:
        audio.setparams((1, 2, 24000, 0, "NONE", "not compressed"))
        audio.writeframes(b"\x00\x00" * 2400)

    async def transport(*args, **kwargs):
        return json.dumps(
            {"audios": [base64.b64encode(out.getvalue()).decode()]}
        ).encode()

    monkeypatch.setattr(ai_provider, "bounded_call", transport)
    with pytest.raises(HTTPException, match="silent speech audio"):
        await ai_provider.selected_speech("Synthetic", "sarvam")


async def test_personal_provider_header_is_exact_and_never_retried_on_failure(monkeypatch):
    calls = []
    async def fail(url, headers, **kwargs):
        calls.append(headers)
        raise HTTPException(503, "Provider unavailable")
    monkeypatch.setattr(ai_provider, "bounded_call", fail)
    with pytest.raises(HTTPException):
        await ai_provider.selected_speech("Synthetic", "sarvam", api_key=SecretStr("synthetic-personal"))
    assert calls == [{"api-subscription-key": "synthetic-personal"}]
