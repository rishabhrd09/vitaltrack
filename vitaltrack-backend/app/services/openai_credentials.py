"""Owner/provider-bound encrypted keys, separate from narration credentials.

Enrollment and status never call OpenAI. A usable record means it can be
unlocked here, not that OpenAI accepts the key or that it has credits.
"""

import json
from datetime import datetime, timezone

from cryptography.fernet import InvalidToken
from fastapi import HTTPException
from pydantic import SecretStr
from sqlalchemy import delete
from sqlalchemy.dialects.postgresql import insert

from app.core.config import settings
from app.core.database import AsyncSessionLocal
from app.models.ai import OpenAICredential
from app.services.sarvam_credentials import cipher


def require_personal_setup():
    if not (
        settings.AI_ENABLED and settings.AI_OPENAI_ENABLED
        and settings.AI_OPENAI_DATA_CONTROLS_REVIEWED
    ):
        raise HTTPException(503, "Personal OpenAI understanding is unavailable on this backend.")
    cipher()
    from app.services.openai_interpreter import configured_model

    configured_model()


def encrypt_key(owner: str, key: SecretStr) -> str:
    envelope = json.dumps({
        "v": 1, "owner": owner, "provider": "openai-text",
        "key": key.get_secret_value(),
    }, separators=(",", ":")).encode()
    return cipher().encrypt(envelope).decode("ascii")


def decrypt_key(owner: str, ciphertext: str) -> SecretStr:
    try:
        envelope = json.loads(cipher().decrypt(ciphertext.encode("ascii")))
        if (
            envelope.get("v") != 1 or envelope.get("owner") != owner
            or envelope.get("provider") != "openai-text"
            or not isinstance(envelope.get("key"), str)
        ):
            raise ValueError()
        return SecretStr(envelope["key"])
    except (InvalidToken, ValueError, TypeError, AttributeError, UnicodeError):
        raise HTTPException(
            503, "Your personal OpenAI key could not be unlocked. Replace it or contact support.",
        ) from None


async def personal_status(owner: str) -> dict:
    try:
        require_personal_setup()
        available = True
    except HTTPException:
        available = False
    async with AsyncSessionLocal() as db:
        row = await db.get(OpenAICredential, owner)
        configured = row is not None
        usable = available and configured
        if usable:
            try:
                decrypt_key(owner, row.ciphertext)
            except HTTPException:
                usable = False
        return {
            "setup_available": available, "configured": configured,
            "usable": bool(usable),
            "updated_at": row.updated_at.isoformat() if row else None,
        }


async def save_key(owner: str, key: SecretStr):
    require_personal_setup()
    values = {
        "user_id": owner, "ciphertext": encrypt_key(owner, key),
        "updated_at": datetime.now(timezone.utc),
    }
    async with AsyncSessionLocal.begin() as db:
        await db.execute(insert(OpenAICredential).values(**values).on_conflict_do_update(
            index_elements=[OpenAICredential.user_id], set_=values,
        ))


async def remove_key(owner: str):
    # Remains available if the feature is paused or the encryption key is lost.
    async with AsyncSessionLocal.begin() as db:
        await db.execute(delete(OpenAICredential).where(OpenAICredential.user_id == owner))


async def load_key(owner: str) -> SecretStr:
    require_personal_setup()
    async with AsyncSessionLocal() as db:
        row = await db.get(OpenAICredential, owner)
        if row is None:
            raise HTTPException(409, "No personal OpenAI key is saved. Add your key or choose on-phone understanding.")
        return decrypt_key(owner, row.ciphertext)
