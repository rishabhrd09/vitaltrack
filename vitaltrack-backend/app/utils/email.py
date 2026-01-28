"""
VitalTrack Backend - Email Utility
Send transactional emails for verification and password reset
"""

import hashlib
import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi_mail import ConnectionConfig, FastMail, MessageSchema, MessageType
from pydantic import EmailStr

from app.core.config import settings


def _get_mail_config() -> Optional[ConnectionConfig]:
    """Get mail configuration if credentials are set."""
    if not settings.MAIL_USERNAME or not settings.MAIL_PASSWORD:
        return None
    
    return ConnectionConfig(
        MAIL_USERNAME=settings.MAIL_USERNAME,
        MAIL_PASSWORD=settings.MAIL_PASSWORD,
        MAIL_FROM=settings.MAIL_FROM,
        MAIL_PORT=settings.MAIL_PORT,
        MAIL_SERVER=settings.MAIL_SERVER,
        MAIL_STARTTLS=settings.MAIL_STARTTLS,
        MAIL_SSL_TLS=settings.MAIL_SSL_TLS,
        USE_CREDENTIALS=True,
        VALIDATE_CERTS=True,
    )


def generate_verification_token() -> tuple[str, str]:
    """
    Generate a verification token pair.
    
    Returns:
        tuple: (unhashed_token, hashed_token)
        - unhashed_token: Send this in the email link
        - hashed_token: Store this in the database
    """
    unhashed_token = secrets.token_urlsafe(32)
    hashed_token = hashlib.sha256(unhashed_token.encode()).hexdigest()
    return unhashed_token, hashed_token


def verify_token(unhashed_token: str, hashed_token: str) -> bool:
    """
    Verify that an unhashed token matches the stored hash.
    
    Args:
        unhashed_token: Token from email link
        hashed_token: Token stored in database
        
    Returns:
        bool: True if tokens match
    """
    computed_hash = hashlib.sha256(unhashed_token.encode()).hexdigest()
    return secrets.compare_digest(computed_hash, hashed_token)


def get_email_verification_expiry() -> datetime:
    """Get expiry datetime for email verification token."""
    return datetime.now(timezone.utc) + timedelta(hours=settings.EMAIL_VERIFICATION_EXPIRY_HOURS)


def get_password_reset_expiry() -> datetime:
    """Get expiry datetime for password reset token."""
    return datetime.now(timezone.utc) + timedelta(hours=settings.PASSWORD_RESET_EXPIRY_HOURS)


async def send_verification_email(
    email: EmailStr,
    username: str,
    token: str,
) -> bool:
    """
    Send email verification link to user.
    
    Args:
        email: User's email address
        username: User's name for personalization
        token: Unhashed verification token
        
    Returns:
        bool: True if sent successfully
    """
    mail_config = _get_mail_config()
    if not mail_config:
        print(f"[EMAIL] Mail not configured. Verification token for {email}: {token}")
        return False
    
    verification_url = f"{settings.FRONTEND_URL}/verify-email?token={token}"
    
    html_content = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <style>
            body {{ font-family: Arial, sans-serif; line-height: 1.6; color: #333; }}
            .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
            .header {{ background: #00D09C; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }}
            .content {{ background: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px; }}
            .button {{ display: inline-block; background: #00D09C; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; margin: 20px 0; }}
            .footer {{ text-align: center; color: #666; font-size: 12px; margin-top: 20px; }}
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>🏥 VitalTrack</h1>
            </div>
            <div class="content">
                <h2>Welcome, {username}!</h2>
                <p>Thank you for registering with VitalTrack. Please verify your email address to complete your registration.</p>
                <p style="text-align: center;">
                    <a href="{verification_url}" class="button">Verify Email Address</a>
                </p>
                <p>Or copy and paste this link in your browser:</p>
                <p style="word-break: break-all; color: #666;">{verification_url}</p>
                <p><strong>This link will expire in {settings.EMAIL_VERIFICATION_EXPIRY_HOURS} hours.</strong></p>
                <p>If you didn't create an account, please ignore this email.</p>
            </div>
            <div class="footer">
                <p>© 2026 VitalTrack - Medical Inventory Management</p>
            </div>
        </div>
    </body>
    </html>
    """
    
    message = MessageSchema(
        subject="Verify your VitalTrack account",
        recipients=[email],
        body=html_content,
        subtype=MessageType.html,
    )
    
    try:
        fast_mail = FastMail(mail_config)
        await fast_mail.send_message(message)
        return True
    except Exception as e:
        print(f"[EMAIL] Failed to send verification email to {email}: {e}")
        return False


async def send_password_reset_email(
    email: EmailStr,
    username: str,
    token: str,
) -> bool:
    """
    Send password reset link to user.
    
    Args:
        email: User's email address
        username: User's name for personalization
        token: Unhashed reset token
        
    Returns:
        bool: True if sent successfully
    """
    mail_config = _get_mail_config()
    if not mail_config:
        print(f"[EMAIL] Mail not configured. Reset token for {email}: {token}")
        return False
    
    reset_url = f"{settings.FRONTEND_URL}/reset-password?token={token}"
    
    html_content = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <style>
            body {{ font-family: Arial, sans-serif; line-height: 1.6; color: #333; }}
            .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
            .header {{ background: #FF6B6B; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }}
            .content {{ background: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px; }}
            .button {{ display: inline-block; background: #FF6B6B; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; margin: 20px 0; }}
            .footer {{ text-align: center; color: #666; font-size: 12px; margin-top: 20px; }}
            .warning {{ background: #fff3cd; border: 1px solid #ffc107; padding: 10px; border-radius: 4px; margin: 15px 0; }}
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>🔐 Password Reset</h1>
            </div>
            <div class="content">
                <h2>Hi {username},</h2>
                <p>We received a request to reset your password for your VitalTrack account.</p>
                <p style="text-align: center;">
                    <a href="{reset_url}" class="button">Reset Password</a>
                </p>
                <p>Or copy and paste this link in your browser:</p>
                <p style="word-break: break-all; color: #666;">{reset_url}</p>
                <div class="warning">
                    <strong>⚠️ This link will expire in {settings.PASSWORD_RESET_EXPIRY_HOURS} hour(s).</strong>
                </div>
                <p>If you didn't request a password reset, please ignore this email or contact support if you have concerns.</p>
            </div>
            <div class="footer">
                <p>© 2026 VitalTrack - Medical Inventory Management</p>
            </div>
        </div>
    </body>
    </html>
    """
    
    message = MessageSchema(
        subject="Reset your VitalTrack password",
        recipients=[email],
        body=html_content,
        subtype=MessageType.html,
    )
    
    try:
        fast_mail = FastMail(mail_config)
        await fast_mail.send_message(message)
        return True
    except Exception as e:
        print(f"[EMAIL] Failed to send password reset email to {email}: {e}")
        return False


async def send_password_changed_notification(
    email: EmailStr,
    username: str,
) -> bool:
    """
    Send notification that password was changed.
    
    Args:
        email: User's email address
        username: User's name for personalization
        
    Returns:
        bool: True if sent successfully
    """
    mail_config = _get_mail_config()
    if not mail_config:
        print(f"[EMAIL] Mail not configured. Skipping password change notification for {email}")
        return False
    
    html_content = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <style>
            body {{ font-family: Arial, sans-serif; line-height: 1.6; color: #333; }}
            .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
            .header {{ background: #00D09C; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }}
            .content {{ background: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px; }}
            .footer {{ text-align: center; color: #666; font-size: 12px; margin-top: 20px; }}
            .alert {{ background: #d4edda; border: 1px solid #c3e6cb; padding: 15px; border-radius: 4px; margin: 15px 0; }}
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>🔒 Password Changed</h1>
            </div>
            <div class="content">
                <h2>Hi {username},</h2>
                <div class="alert">
                    <strong>✅ Your password has been successfully changed.</strong>
                </div>
                <p>If you made this change, no further action is needed.</p>
                <p>If you did NOT make this change, please contact support immediately and secure your account.</p>
            </div>
            <div class="footer">
                <p>© 2026 VitalTrack - Medical Inventory Management</p>
            </div>
        </div>
    </body>
    </html>
    """
    
    message = MessageSchema(
        subject="Your VitalTrack password was changed",
        recipients=[email],
        body=html_content,
        subtype=MessageType.html,
    )
    
    try:
        fast_mail = FastMail(mail_config)
        await fast_mail.send_message(message)
        return True
    except Exception as e:
        print(f"[EMAIL] Failed to send password change notification to {email}: {e}")
        return False
