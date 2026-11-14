"""Browser-only cookie transport around the existing mobile auth services.

Refresh tokens never enter a browser JSON response. The token's device_name is
a random browser-family marker, carried through rotation, so logout can revoke
descendants even when it races with an already-committed refresh.
"""
from uuid import uuid4

from fastapi import APIRouter, BackgroundTasks, HTTPException, Request, Response
from pydantic import BaseModel
from sqlalchemy import select, update
from sqlalchemy.orm import noload

from app.api.deps import DB
from app.api.v1.auth import (
    authenticate_account,
    email_verification_pending,
    register_account,
    rotate_refresh_token,
)
from app.core.config import settings
from app.core.security import decode_token
from app.models import RefreshToken, User
from app.schemas import AuthResponse, TokenRefresh, UserLogin, UserRegister, UserResponse
from app.utils.rate_limiter import limiter

router = APIRouter(prefix="/web-auth", tags=["Browser authentication"])
COOKIE_PATH = "/api/v1/web-auth"


class BrowserAuthResponse(BaseModel):
    access_token: str
    token_type: str
    expires_in: int
    user: UserResponse


class BrowserRegisterResponse(BaseModel):
    verificationRequired: bool
    user: UserResponse


def cookie_settings() -> tuple[str, bool]:
    secure = settings.ENVIRONMENT in {"production", "staging"}
    return ("__Secure-carekosh_refresh" if secure else "carekosh_refresh", secure)


def check_browser_request(request: Request) -> None:
    if not settings.WEB_AUTH_ENABLED:
        raise HTTPException(404, "Browser authentication is not enabled")
    if request.headers.get("Origin") not in settings.WEB_APP_ORIGINS:
        raise HTTPException(403, "Browser origin is not allowed")
    if request.headers.get("X-CareKosh-Web") != "1":
        raise HTTPException(403, "Browser request header is required")
    if request.headers.get("Sec-Fetch-Site") == "cross-site":
        raise HTTPException(403, "Cross-site browser authentication is not allowed")


def set_refresh_cookie(response: Response, token: str) -> None:
    name, secure = cookie_settings()
    response.set_cookie(
        name, token, max_age=settings.REFRESH_TOKEN_EXPIRE_DAYS * 86400,
        httponly=True, secure=secure, samesite="strict", path=COOKIE_PATH,
        # No Domain attribute: the cookie belongs only to this API hostname.
    )
    response.headers["Cache-Control"] = "no-store"


def browser_response(result: AuthResponse, response: Response) -> BrowserAuthResponse:
    set_refresh_cookie(response, result.refresh_token)
    return BrowserAuthResponse(
        access_token=result.access_token, token_type=result.token_type,
        expires_in=result.expires_in, user=result.user,
    )


async def revoke_browser_family(token: str | None, db: DB) -> None:
    payload = decode_token(token) if token else None
    if not payload or payload.type != "refresh" or not payload.jti:
        return
    # Match rotation's user -> refresh ordering to prevent a surviving child.
    user = await db.scalar(select(User).where(User.id == payload.sub).options(noload("*")).with_for_update())
    if not user:
        return
    row = await db.scalar(select(RefreshToken).where(
        RefreshToken.jti == payload.jti, RefreshToken.user_id == user.id,
    ))
    if row and row.device_type == "web" and (row.device_name or "").startswith("web:"):
        await db.execute(update(RefreshToken).where(
            RefreshToken.user_id == user.id, RefreshToken.device_type == "web",
            RefreshToken.device_name == row.device_name,
        ).values(is_revoked=True))


@router.post("/login", response_model=BrowserAuthResponse)
@limiter.shared_limit("5/minute", scope="auth:login")
async def login(request: Request, response: Response, data: UserLogin, db: DB):
    check_browser_request(request)
    # A mistyped password must not end the session this browser already has.
    result = await authenticate_account(request, data, db, browser_family=f"web:{uuid4()}")
    # authenticate_account committed, releasing the new account's lock, before
    # the replaced session is revoked under its own account's lock.
    await revoke_browser_family(request.cookies.get(cookie_settings()[0]), db)
    await db.commit()
    return browser_response(result, response)


@router.post("/refresh", response_model=BrowserAuthResponse)
@limiter.limit("30/minute")
async def refresh(request: Request, response: Response, db: DB):
    check_browser_request(request)
    token = request.cookies.get(cookie_settings()[0])
    if not token:
        raise HTTPException(401, "No browser session")
    result = await rotate_refresh_token(TokenRefresh(refresh_token=token), db, request, browser_only=True)
    return browser_response(result, response)


@router.post("/logout")
@limiter.limit("30/minute")
async def logout(request: Request, response: Response, db: DB):
    check_browser_request(request)
    name, secure = cookie_settings()
    await revoke_browser_family(request.cookies.get(name), db)
    await db.commit()
    response.delete_cookie(name, path=COOKIE_PATH, secure=secure, httponly=True, samesite="strict")
    response.headers["Cache-Control"] = "no-store"
    return {"message": "Signed out"}


@router.post("/register", response_model=BrowserRegisterResponse, status_code=201)
@limiter.shared_limit("3/hour", scope="auth:register")
async def register(request: Request, response: Response, data: UserRegister, background_tasks: BackgroundTasks, db: DB):
    check_browser_request(request)
    result = await register_account(request, data, background_tasks, db)
    payload = decode_token(result.refresh_token)
    if payload and payload.jti:
        await db.execute(update(RefreshToken).where(RefreshToken.jti == payload.jti).values(is_revoked=True))
        await db.commit()
    # Registration has no browser session. Sign-in follows email verification.
    response.headers["Cache-Control"] = "no-store"
    # Same rule as sign-in: without email delivery, the account can sign in now.
    return BrowserRegisterResponse(
        verificationRequired=email_verification_pending(result.user),
        user=result.user,
    )
