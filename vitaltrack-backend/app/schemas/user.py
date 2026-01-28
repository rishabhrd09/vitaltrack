"""
VitalTrack Backend - User Schemas
Pydantic models for user authentication and profile
"""

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, EmailStr, Field, field_validator
import re


# =============================================================================
# REQUEST SCHEMAS
# =============================================================================
class UserRegister(BaseModel):
    """User registration request - supports email OR username."""
    
    email: Optional[EmailStr] = Field(None, description="Email address (optional if username provided)")
    username: Optional[str] = Field(
        None, 
        min_length=3, 
        max_length=50, 
        pattern=r'^[a-z0-9_]+$',
        description="Username: lowercase letters, numbers, underscores only"
    )
    password: str = Field(..., min_length=8, max_length=128)
    name: str = Field(..., min_length=1, max_length=255)
    phone: Optional[str] = Field(None, max_length=50)

    @field_validator("password")
    @classmethod
    def validate_password(cls, v: str) -> str:
        """Validate password strength."""
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters")
        if not re.search(r"[A-Z]", v):
            raise ValueError("Password must contain at least one uppercase letter")
        if not re.search(r"[a-z]", v):
            raise ValueError("Password must contain at least one lowercase letter")
        if not re.search(r"\d", v):
            raise ValueError("Password must contain at least one digit")
        return v

    @field_validator("username")
    @classmethod
    def validate_username(cls, v: Optional[str]) -> Optional[str]:
        """Validate and normalize username."""
        if v is None:
            return v
        v = v.lower().strip()
        if "@" in v:
            raise ValueError("Username cannot contain @. Use email field for email addresses.")
        if not re.match(r'^[a-z0-9_]+$', v):
            raise ValueError("Username can only contain lowercase letters, numbers, and underscores")
        return v

    @field_validator("name")
    @classmethod
    def validate_name(cls, v: str) -> str:
        """Sanitize name input."""
        v = re.sub(r"<[^>]*>", "", v)
        v = re.sub(r"[<>'\";]", "", v)
        return v.strip()

    def model_post_init(self, __context) -> None:
        """Validate that at least email or username is provided."""
        if not self.email and not self.username:
            raise ValueError("Either email or username is required")


class UserLogin(BaseModel):
    """User login request - accepts email OR username in single field."""
    
    identifier: str = Field(
        ..., 
        min_length=1,
        description="Enter email address OR username"
    )
    password: str = Field(..., min_length=1)
    
    @field_validator("identifier")
    @classmethod
    def normalize_identifier(cls, v: str) -> str:
        """Normalize the identifier to lowercase."""
        return v.lower().strip()


class TokenRefresh(BaseModel):
    """Token refresh request."""
    
    refresh_token: str


class PasswordChange(BaseModel):
    """Password change request."""
    
    current_password: str
    new_password: str = Field(..., min_length=8, max_length=128)

    @field_validator("new_password")
    @classmethod
    def validate_password(cls, v: str) -> str:
        """Validate password strength."""
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters")
        if not re.search(r"[A-Z]", v):
            raise ValueError("Password must contain at least one uppercase letter")
        if not re.search(r"[a-z]", v):
            raise ValueError("Password must contain at least one lowercase letter")
        if not re.search(r"\d", v):
            raise ValueError("Password must contain at least one digit")
        return v


class PasswordReset(BaseModel):
    """Password reset request."""
    
    email: EmailStr


class PasswordResetConfirm(BaseModel):
    """Password reset confirmation."""
    
    token: str
    new_password: str = Field(..., min_length=8, max_length=128)


class UserUpdate(BaseModel):
    """User profile update request."""
    
    email: Optional[EmailStr] = Field(None, description="Add email to username-only account")
    username: Optional[str] = Field(
        None, 
        min_length=3, 
        max_length=50, 
        pattern=r'^[a-z0-9_]+$',
        description="Add username to email-only account"
    )
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    phone: Optional[str] = Field(None, max_length=50)

    @field_validator("username")
    @classmethod
    def validate_username(cls, v: Optional[str]) -> Optional[str]:
        """Validate and normalize username."""
        if v is None:
            return v
        v = v.lower().strip()
        if "@" in v:
            raise ValueError("Username cannot contain @")
        return v

    @field_validator("name")
    @classmethod
    def validate_name(cls, v: Optional[str]) -> Optional[str]:
        """Sanitize name input."""
        if v is None:
            return v
        v = re.sub(r"<[^>]*>", "", v)
        v = re.sub(r"[<>'\";]", "", v)
        return v.strip()


# =============================================================================
# RESPONSE SCHEMAS
# =============================================================================
class UserResponse(BaseModel):
    """User profile response - camelCase for frontend compatibility."""
    
    id: str
    email: Optional[str] = None  # Optional for username-only users
    username: Optional[str] = None  # Optional for email-only users
    name: str
    phone: Optional[str] = None
    is_active: bool = Field(serialization_alias="isActive")
    is_verified: bool = Field(serialization_alias="isVerified")
    is_email_verified: bool = Field(serialization_alias="isEmailVerified")
    created_at: datetime = Field(serialization_alias="createdAt")
    updated_at: datetime = Field(serialization_alias="updatedAt")
    last_login: Optional[datetime] = Field(None, serialization_alias="lastLogin")

    model_config = {"from_attributes": True, "populate_by_name": True}


class UserBrief(BaseModel):
    """Brief user info for embedded responses."""
    
    id: str
    email: Optional[str] = None
    username: Optional[str] = None
    name: str

    model_config = {"from_attributes": True}


class AuthResponse(BaseModel):
    """Authentication response with tokens and user info."""
    
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int
    user: UserResponse


class MessageResponse(BaseModel):
    """Simple message response."""
    
    message: str
    success: bool = True


# =============================================================================
# EMAIL VERIFICATION SCHEMAS
# =============================================================================
class EmailVerificationRequest(BaseModel):
    """Request to resend verification email."""
    email: EmailStr


class VerifyEmailResponse(BaseModel):
    """Response after email verification."""
    message: str
    is_verified: bool


# =============================================================================
# PASSWORD RESET SCHEMAS
# =============================================================================
class ForgotPasswordRequest(BaseModel):
    """Request for password reset link."""
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    """Request to reset password with token."""
    token: str
    new_password: str = Field(..., min_length=8, max_length=128)

    @field_validator("new_password")
    @classmethod
    def validate_password(cls, v: str) -> str:
        """Validate password strength."""
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters")
        if not re.search(r"[A-Z]", v):
            raise ValueError("Password must contain at least one uppercase letter")
        if not re.search(r"[a-z]", v):
            raise ValueError("Password must contain at least one lowercase letter")
        if not re.search(r"\d", v):
            raise ValueError("Password must contain at least one digit")
        return v

