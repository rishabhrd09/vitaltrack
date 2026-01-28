"""
VitalTrack Backend - Authentication Routes
User registration, login, token refresh, logout, email verification, and password reset
"""

from datetime import datetime, timedelta, timezone
from uuid import uuid4

from fastapi import APIRouter, BackgroundTasks, HTTPException, Request, status
from sqlalchemy import select, update

from app.api.deps import DB, CurrentUser
from app.core.config import settings
from app.core.security import (
    create_token_pair,
    hash_password,
    verify_password,
    verify_refresh_token,
)
from app.models import ActivityActionType, ActivityLog, RefreshToken, User
from app.schemas import (
    AuthResponse,
    EmailVerificationRequest,
    ForgotPasswordRequest,
    MessageResponse,
    PasswordChange,
    ResetPasswordRequest,
    TokenRefresh,
    UserLogin,
    UserRegister,
    UserResponse,
    UserUpdate,
    VerifyEmailResponse,
)
from app.utils.email import (
    generate_verification_token,
    verify_token,
    get_email_verification_expiry,
    get_password_reset_expiry,
    send_verification_email,
    send_password_reset_email,
    send_password_changed_notification,
)
from app.utils.rate_limiter import limiter


router = APIRouter(prefix="/auth", tags=["Authentication"])


# =============================================================================
# REGISTRATION
# =============================================================================
@router.post(
    "/register",
    response_model=AuthResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Register a new user",
)
@limiter.limit("3/hour")
async def register(
    request: Request,
    data: UserRegister,
    background_tasks: BackgroundTasks,
    db: DB,
) -> AuthResponse:
    """
    Register a new user account.
    
    - **email**: Valid email address (required if no username)
    - **username**: 3-50 chars, lowercase alphanumeric + underscore (required if no email)
    - **password**: Min 8 chars with uppercase, lowercase, and digit
    - **name**: User's display name
    - **phone**: Optional phone number
    
    Rate limited: 3 registrations per hour per IP.
    """
    # Check if email exists (if provided)
    if data.email:
        result = await db.execute(
            select(User).where(User.email == data.email.lower())
        )
        if result.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Email already registered",
            )
    
    # Check if username exists (if provided)
    if data.username:
        result = await db.execute(
            select(User).where(User.username == data.username.lower())
        )
        if result.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Username already taken",
            )
    
    # Generate email verification token if email provided
    unhashed_token = None
    hashed_token = None
    verification_expiry = None
    if data.email:
        unhashed_token, hashed_token = generate_verification_token()
        verification_expiry = get_email_verification_expiry()
    
    # Create user
    user = User(
        email=data.email.lower() if data.email else None,
        username=data.username.lower() if data.username else None,
        hashed_password=hash_password(data.password),
        name=data.name,
        phone=data.phone,
        is_active=True,
        is_verified=False,
        is_email_verified=False,
        email_verification_token=hashed_token,
        email_verification_expiry=verification_expiry,
    )
    db.add(user)
    await db.flush()
    
    # Create tokens
    jti = str(uuid4())
    tokens = create_token_pair(user.id, jti)
    
    # Store refresh token
    refresh_token = RefreshToken(
        jti=jti,
        user_id=user.id,
        expires_at=datetime.now(timezone.utc) + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS),
        device_name=request.headers.get("User-Agent", "Unknown")[:255],
        ip_address=request.client.host if request.client else None,
    )
    db.add(refresh_token)
    
    # Log activity
    identifier = user.email or user.username
    activity = ActivityLog(
        user_id=user.id,
        action=ActivityActionType.USER_REGISTER,
        item_name=identifier,
        details="Account created",
    )
    db.add(activity)
    
    await db.commit()
    await db.refresh(user)
    
    # Send verification email in background (if email provided)
    if user.email and unhashed_token:
        background_tasks.add_task(
            send_verification_email,
            email=user.email,
            username=user.name,
            token=unhashed_token,
        )
    
    return AuthResponse(
        access_token=tokens.access_token,
        refresh_token=tokens.refresh_token,
        token_type=tokens.token_type,
        expires_in=tokens.expires_in,
        user=UserResponse.model_validate(user),
    )


# =============================================================================
# LOGIN
# =============================================================================
@router.post(
    "/login",
    response_model=AuthResponse,
    summary="Login with email or username",
)
@limiter.limit("5/minute")
async def login(
    request: Request,
    data: UserLogin,
    db: DB,
) -> AuthResponse:
    """
    Authenticate user with email OR username and password.
    
    - **identifier**: Enter your email address or username
    - Auto-detects: contains @ = email, otherwise = username
    
    Rate limited: 5 login attempts per minute per IP.
    Returns access and refresh tokens on success.
    """
    identifier = data.identifier  # Already normalized to lowercase
    
    # Auto-detect: email contains @, username doesn't
    if "@" in identifier:
        # Login by email
        result = await db.execute(
            select(User).where(User.email == identifier)
        )
    else:
        # Login by username
        result = await db.execute(
            select(User).where(User.username == identifier)
        )
    
    user = result.scalar_one_or_none()
    
    if not user or not verify_password(data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email/username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is disabled",
        )
    
    # Create tokens
    jti = str(uuid4())
    tokens = create_token_pair(user.id, jti)
    
    # Store refresh token
    refresh_token = RefreshToken(
        jti=jti,
        user_id=user.id,
        expires_at=datetime.now(timezone.utc) + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS),
        device_name=request.headers.get("User-Agent", "Unknown")[:255],
        ip_address=request.client.host if request.client else None,
    )
    db.add(refresh_token)
    
    # Update last login
    user.last_login = datetime.now(timezone.utc)
    
    # Log activity
    user_identifier = user.email or user.username
    activity = ActivityLog(
        user_id=user.id,
        action=ActivityActionType.USER_LOGIN,
        item_name=user_identifier,
        details=f"Login from {request.client.host if request.client else 'unknown'}",
    )
    db.add(activity)
    
    await db.commit()
    await db.refresh(user)
    
    return AuthResponse(
        access_token=tokens.access_token,
        refresh_token=tokens.refresh_token,
        token_type=tokens.token_type,
        expires_in=tokens.expires_in,
        user=UserResponse.model_validate(user),
    )


# =============================================================================
# EMAIL VERIFICATION
# =============================================================================
@router.get(
    "/verify-email/{token}",
    response_model=VerifyEmailResponse,
    summary="Verify email address",
)
async def verify_email(
    token: str,
    db: DB,
) -> VerifyEmailResponse:
    """
    Verify user's email address using the token sent via email.
    
    The token is included in the verification link sent to the user's email.
    """
    # Find users with pending verification (non-expired tokens)
    result = await db.execute(
        select(User).where(
            User.email_verification_token.isnot(None),
            User.email_verification_expiry > datetime.now(timezone.utc),
        )
    )
    users = result.scalars().all()
    
    # Check token against all users with pending verification
    verified_user = None
    for user in users:
        if verify_token(token, user.email_verification_token):
            verified_user = user
            break
    
    if not verified_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired verification token",
        )
    
    # Mark email as verified
    verified_user.is_email_verified = True
    verified_user.email_verification_token = None
    verified_user.email_verification_expiry = None
    
    await db.commit()
    
    return VerifyEmailResponse(
        message="Email verified successfully! You can now log in.",
        is_verified=True,
    )


@router.post(
    "/resend-verification",
    response_model=MessageResponse,
    summary="Resend verification email",
)
@limiter.limit("3/hour")
async def resend_verification_email(
    request: Request,
    data: EmailVerificationRequest,
    background_tasks: BackgroundTasks,
    db: DB,
) -> MessageResponse:
    """
    Resend the email verification link.
    
    Rate limited: 3 requests per hour per IP.
    """
    # Find user by email
    result = await db.execute(
        select(User).where(User.email == data.email.lower())
    )
    user = result.scalar_one_or_none()
    
    # Always return success (don't reveal if email exists)
    if not user:
        return MessageResponse(
            message="If an account exists with this email, a verification link will be sent.",
        )
    
    # Check if already verified
    if user.is_email_verified:
        return MessageResponse(
            message="Email is already verified.",
        )
    
    # Generate new token
    unhashed_token, hashed_token = generate_verification_token()
    
    user.email_verification_token = hashed_token
    user.email_verification_expiry = get_email_verification_expiry()
    
    await db.commit()
    
    # Send email in background
    background_tasks.add_task(
        send_verification_email,
        email=user.email,
        username=user.name,
        token=unhashed_token,
    )
    
    return MessageResponse(
        message="If an account exists with this email, a verification link will be sent.",
    )


# =============================================================================
# PASSWORD RESET
# =============================================================================
@router.post(
    "/forgot-password",
    response_model=MessageResponse,
    summary="Request password reset",
)
@limiter.limit("3/hour")
async def forgot_password(
    request: Request,
    data: ForgotPasswordRequest,
    background_tasks: BackgroundTasks,
    db: DB,
) -> MessageResponse:
    """
    Send a password reset link to the user's email.
    
    Rate limited: 3 requests per hour per IP.
    Always returns success to prevent email enumeration.
    """
    # Find user by email
    result = await db.execute(
        select(User).where(User.email == data.email.lower())
    )
    user = result.scalar_one_or_none()
    
    # Always return success (don't reveal if email exists - security!)
    if not user:
        return MessageResponse(
            message="If an account exists with this email, a password reset link will be sent.",
        )
    
    # Check if account is active
    if not user.is_active:
        return MessageResponse(
            message="If an account exists with this email, a password reset link will be sent.",
        )
    
    # Generate reset token
    unhashed_token, hashed_token = generate_verification_token()
    
    user.password_reset_token = hashed_token
    user.password_reset_expiry = get_password_reset_expiry()
    
    await db.commit()
    
    # Send email in background
    background_tasks.add_task(
        send_password_reset_email,
        email=user.email,
        username=user.name,
        token=unhashed_token,
    )
    
    return MessageResponse(
        message="If an account exists with this email, a password reset link will be sent.",
    )


@router.post(
    "/reset-password",
    response_model=MessageResponse,
    summary="Reset password",
)
@limiter.limit("5/hour")
async def reset_password(
    request: Request,
    data: ResetPasswordRequest,
    background_tasks: BackgroundTasks,
    db: DB,
) -> MessageResponse:
    """
    Reset password using the token from email.
    
    Rate limited: 5 attempts per hour per IP.
    Revokes all existing sessions for security.
    """
    # Find users with valid reset token
    result = await db.execute(
        select(User).where(
            User.password_reset_token.isnot(None),
            User.password_reset_expiry > datetime.now(timezone.utc),
        )
    )
    users = result.scalars().all()
    
    # Check token against all users with pending reset
    target_user = None
    for user in users:
        if verify_token(data.token, user.password_reset_token):
            target_user = user
            break
    
    if not target_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired reset token",
        )
    
    # Update password
    target_user.hashed_password = hash_password(data.new_password)
    target_user.password_reset_token = None
    target_user.password_reset_expiry = None
    
    # Revoke all existing refresh tokens (security measure)
    await db.execute(
        update(RefreshToken)
        .where(RefreshToken.user_id == target_user.id)
        .values(is_revoked=True)
    )
    
    await db.commit()
    
    # Send notification email
    if target_user.email:
        background_tasks.add_task(
            send_password_changed_notification,
            email=target_user.email,
            username=target_user.name,
        )
    
    return MessageResponse(
        message="Password reset successfully! Please log in with your new password.",
    )


# =============================================================================
# TOKEN REFRESH
# =============================================================================
@router.post(
    "/refresh",
    response_model=AuthResponse,
    summary="Refresh access token",
)
async def refresh_token(
    data: TokenRefresh,
    db: DB,
    request: Request,
) -> AuthResponse:
    """
    Get new access token using refresh token.
    
    Also rotates the refresh token for security.
    """
    # Verify refresh token
    result = verify_refresh_token(data.refresh_token)
    if not result:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired refresh token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    user_id, jti = result
    
    # Check if token exists and is not revoked
    token_result = await db.execute(
        select(RefreshToken).where(
            RefreshToken.jti == jti,
            RefreshToken.user_id == user_id,
        )
    )
    stored_token = token_result.scalar_one_or_none()
    
    if not stored_token or stored_token.is_revoked:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token has been revoked",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    # Get user
    user_result = await db.execute(
        select(User).where(User.id == user_id)
    )
    user = user_result.scalar_one_or_none()
    
    if not user or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found or disabled",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    # Revoke old token
    stored_token.is_revoked = True
    
    # Create new tokens (token rotation)
    new_jti = str(uuid4())
    tokens = create_token_pair(user.id, new_jti)
    
    # Store new refresh token
    new_refresh_token = RefreshToken(
        jti=new_jti,
        user_id=user.id,
        expires_at=datetime.now(timezone.utc) + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS),
        device_name=request.headers.get("User-Agent", "Unknown")[:255],
        ip_address=request.client.host if request.client else None,
    )
    db.add(new_refresh_token)
    
    await db.commit()
    await db.refresh(user)
    
    return AuthResponse(
        access_token=tokens.access_token,
        refresh_token=tokens.refresh_token,
        token_type=tokens.token_type,
        expires_in=tokens.expires_in,
        user=UserResponse.model_validate(user),
    )


# =============================================================================
# LOGOUT
# =============================================================================
@router.post(
    "/logout",
    response_model=MessageResponse,
    summary="Logout and revoke token",
)
async def logout(
    data: TokenRefresh,
    db: DB,
    current_user: CurrentUser,
) -> MessageResponse:
    """
    Logout user and revoke refresh token.
    """
    # Verify and revoke the refresh token
    result = verify_refresh_token(data.refresh_token)
    if result:
        user_id, jti = result
        
        token_result = await db.execute(
            select(RefreshToken).where(
                RefreshToken.jti == jti,
                RefreshToken.user_id == current_user.id,
            )
        )
        stored_token = token_result.scalar_one_or_none()
        
        if stored_token:
            stored_token.is_revoked = True
    
    # Log activity
    user_identifier = current_user.email or current_user.username
    activity = ActivityLog(
        user_id=current_user.id,
        action=ActivityActionType.USER_LOGOUT,
        item_name=user_identifier,
        details="User logged out",
    )
    db.add(activity)
    
    await db.commit()
    
    return MessageResponse(message="Successfully logged out")


# =============================================================================
# PROFILE
# =============================================================================
@router.get(
    "/me",
    response_model=UserResponse,
    summary="Get current user profile",
)
async def get_profile(
    current_user: CurrentUser,
) -> UserResponse:
    """
    Get the current authenticated user's profile.
    """
    return UserResponse.model_validate(current_user)


@router.patch(
    "/me",
    response_model=UserResponse,
    summary="Update current user profile",
)
async def update_profile(
    data: UserUpdate,
    db: DB,
    current_user: CurrentUser,
) -> UserResponse:
    """
    Update the current user's profile.
    
    Can also add email or username to an existing account.
    """
    # Check if new email is unique
    if data.email is not None:
        result = await db.execute(
            select(User).where(User.email == data.email.lower(), User.id != current_user.id)
        )
        if result.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Email already in use by another account",
            )
        current_user.email = data.email.lower()
    
    # Check if new username is unique
    if data.username is not None:
        result = await db.execute(
            select(User).where(User.username == data.username.lower(), User.id != current_user.id)
        )
        if result.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Username already taken",
            )
        current_user.username = data.username.lower()
    
    if data.name is not None:
        current_user.name = data.name
    if data.phone is not None:
        current_user.phone = data.phone
    
    await db.commit()
    await db.refresh(current_user)
    
    return UserResponse.model_validate(current_user)


# =============================================================================
# PASSWORD CHANGE
# =============================================================================
@router.post(
    "/change-password",
    response_model=MessageResponse,
    summary="Change password",
)
async def change_password(
    data: PasswordChange,
    db: DB,
    current_user: CurrentUser,
) -> MessageResponse:
    """
    Change the current user's password.
    
    Requires current password for verification.
    """
    if not verify_password(data.current_password, current_user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Current password is incorrect",
        )
    
    current_user.hashed_password = hash_password(data.new_password)
    
    await db.commit()
    
    return MessageResponse(message="Password changed successfully")
