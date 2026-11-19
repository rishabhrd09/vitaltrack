"""English narration contract. No microphone, interpretation or inventory access.

Reviewed 2026-10-11 against Sarvam REST and voice-catalog documentation.
v3 has a published price; v4 Flash is optional after account pricing is checked.
Only common REST parameters are used: the v4 guide and REST schema disagree
about pitch/loudness/preprocessing. No runtime model or provider fallback.
"""

import base64
import binascii
import io
import json
import math
import struct
import wave

from fastapi import HTTPException

from app.core.config import settings

V3_SPEAKERS = frozenset(
    "shubh aditya ritu priya neha rahul pooja rohan simran kavya amit dev ishita "
    "shreya ratan varun manan sumit roopa kabir aayan ashutosh advait anand tanya "
    "tarun sunny mani gokul vijay shruti suhani mohit kavitha rehan soham rupali".split()
)
# Small reviewed English shortlist, rather than accepting arbitrary persona IDs.
V4_SPEAKERS = frozenset(
    {
        "aparna_en_companion",
        "sanchita_en_companion",
        "simran_en_customer",
        "shubh_en_narration_gentle",
    }
)


def english_voice() -> dict[str, str]:
    model = settings.SARVAM_TTS_MODEL
    speaker = settings.SARVAM_SPEAKER.strip()
    if model == "bulbul:v3":
        speaker = speaker or "ritu"
        allowed = V3_SPEAKERS
    elif model == "bulbul:v4-flash":
        speaker = speaker or "aparna_en_companion"
        allowed = V4_SPEAKERS
    else:
        raise HTTPException(503, "Sarvam speech model is not configured correctly.")
    if speaker not in allowed:
        raise HTTPException(
            503, "Sarvam English speaker does not match the configured model."
        )
    return {"model": model, "speaker": speaker, "language_code": "en-IN"}


def request_payload(text: str, pace: float = 1.0) -> dict:
    if not isinstance(text, str) or not 1 <= len(text.strip()) <= 640:
        raise HTTPException(
            422, "Speech requires a short answer of at most 640 characters."
        )
    if isinstance(pace, bool) or pace not in (0.9, 1.0, 1.1):
        raise HTTPException(422, "Unsupported speaking pace.")
    return {
        **english_voice(),
        "text": text.strip(),
        "speech_sample_rate": 24000,
        "output_audio_codec": "wav",
        "pace": pace,
        "temperature": 0.3,
    }


def decode_audio(raw: bytes) -> bytes:
    """Decode exactly one clip; WAV validation is shared with other speech adapters."""
    try:
        audios = json.loads(raw)["audios"]
        if (
            not isinstance(audios, list)
            or len(audios) != 1
            or not isinstance(audios[0], str)
        ):
            raise ValueError()
        return base64.b64decode(audios[0], validate=True)
    except (ValueError, TypeError, KeyError, binascii.Error):
        raise HTTPException(502, "Sarvam returned invalid speech audio.") from None


def require_signal(pcm_wav: bytes) -> bytes:
    """Reject effectively silent output after the shared PCM16 WAV validation.

    This measures the clip, not the phone's volume, route or physical audibility.
    """
    with wave.open(io.BytesIO(pcm_wav), "rb") as audio:
        frames = audio.getnframes()
        pcm = audio.readframes(frames)
    power = math.fsum(sample[0] ** 2 for sample in struct.iter_unpack("<h", pcm))
    if math.sqrt(power / frames) / 32768 < 0.0001:
        raise HTTPException(
            502, "Sarvam returned silent speech audio. Try device voice or retry later."
        )
    return pcm_wav
