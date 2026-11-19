"""Personal narration keys: authenticated encryption and short owner-scoped DB work.

Fernet authenticates the entire envelope, including owner/provider identity.
No plaintext key, ciphertext, prefix or suffix is returned in public metadata.
"""

import json
from datetime import datetime, timezone

from cryptography.fernet import Fernet, InvalidToken, MultiFernet
from fastapi import HTTPException
from pydantic import SecretStr
from sqlalchemy import delete
from sqlalchemy.dialects.postgresql import insert

from app.core.config import settings
from app.core.database import AsyncSessionLocal
from app.models.ai import SarvamCredential
from app.services.sarvam_speech import english_voice


def cipher() -> MultiFernet:
    primary = settings.AI_CREDENTIAL_ENCRYPTION_KEY.get_secret_value()
    previous = settings.AI_CREDENTIAL_PREVIOUS_ENCRYPTION_KEYS.get_secret_value()
    try:
        keys = [primary, *[key.strip() for key in previous.split(",") if key.strip()]]
        if not primary or len(keys) > 4:
            raise ValueError()
        return MultiFernet([Fernet(key.encode("ascii")) for key in keys])
    except (ValueError, UnicodeError):
        raise HTTPException(
            503, "Personal key storage is not configured on this backend."
        ) from None


def require_personal_setup():
    if not (
        settings.AI_ENABLED
        and settings.AI_SPEECH_ENABLED
        and settings.AI_SARVAM_ENABLED
        and settings.AI_SARVAM_BYOK_ENABLED
        and settings.AI_SARVAM_DATA_CONTROLS_REVIEWED
    ):
        raise HTTPException(
            503, "Personal Sarvam narration is unavailable on this backend."
        )
    cipher()
    english_voice()


def encrypt_key(owner: str, key: SecretStr) -> str:
    envelope = json.dumps(
        {
            "v": 1,
            "owner": owner,
            "provider": "sarvam-speech",
            "key": key.get_secret_value(),
        },
        separators=(",", ":"),
    ).encode()
    return cipher().encrypt(envelope).decode("ascii")


def decrypt_key(owner: str, ciphertext: str) -> SecretStr:
    try:
        envelope = json.loads(cipher().decrypt(ciphertext.encode("ascii")))
        if (
            envelope.get("v") != 1
            or envelope.get("owner") != owner
            or envelope.get("provider") != "sarvam-speech"
            or not isinstance(envelope.get("key"), str)
        ):
            raise ValueError()
        return SecretStr(envelope["key"])
    except (InvalidToken, ValueError, TypeError, AttributeError, UnicodeError):
        raise HTTPException(
            503,
            "Your personal key could not be unlocked. Replace it or contact support.",
        ) from None


async def personal_status(owner: str) -> dict:
    try:
        require_personal_setup()
        available = True
    except HTTPException:
        available = False
    async with AsyncSessionLocal() as db:
        row = await db.get(SarvamCredential, owner)
        configured = row is not None
        updated = row.updated_at.isoformat() if row else None
        usable = available and configured
        if usable:
            try:
                decrypt_key(owner, row.ciphertext)
            except HTTPException:
                usable = False
    return {
        "setup_available": available,
        "configured": configured,
        "usable": bool(usable),
        "updated_at": updated,
    }


async def save_key(owner: str, key: SecretStr):
    require_personal_setup()
    values = {
        "user_id": owner,
        "ciphertext": encrypt_key(owner, key),
        "updated_at": datetime.now(timezone.utc),
    }
    async with AsyncSessionLocal.begin() as db:
        await db.execute(
            insert(SarvamCredential)
            .values(**values)
            .on_conflict_do_update(
                index_elements=[SarvamCredential.user_id], set_=values
            )
        )


async def remove_key(owner: str):
    # Removal remains possible if a feature is paused or an encryption key is lost.
    async with AsyncSessionLocal.begin() as db:
        await db.execute(
            delete(SarvamCredential).where(SarvamCredential.user_id == owner)
        )


async def load_key(owner: str) -> SecretStr:
    require_personal_setup()
    async with AsyncSessionLocal() as db:
        row = await db.get(SarvamCredential, owner)
        if row is None:
            raise HTTPException(
                409,
                "No personal Sarvam key is saved. Add your key or explicitly choose another voice.",
            )
        return decrypt_key(owner, row.ciphertext)
