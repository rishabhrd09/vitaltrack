"""
VitalTrack Backend - Email Utility (Brevo API Version)
Uses Brevo v3 REST API over HTTPS (Port 443) to bypass SMTP port blocks.
"""

import hashlib
import secrets
from datetime import datetime, timedelta, timezone

import httpx
from pydantic import EmailStr

from app.core.config import settings


def generate_verification_token() -> tuple[str, str]:
    """Generate a verification token pair (unhashed, hashed)."""
    unhashed_token = secrets.token_urlsafe(32)
    hashed_token = hashlib.sha256(unhashed_token.encode()).hexdigest()
    return unhashed_token, hashed_token


def verify_token(unhashed_token: str, hashed_token: str) -> bool:
    """Verify that an unhashed token matches the stored hash."""
    computed_hash = hashlib.sha256(unhashed_token.encode()).hexdigest()
    return secrets.compare_digest(computed_hash, hashed_token)


def get_email_verification_expiry() -> datetime:
    return datetime.now(timezone.utc) + timedelta(hours=settings.EMAIL_VERIFICATION_EXPIRY_HOURS)


def get_password_reset_expiry() -> datetime:
    return datetime.now(timezone.utc) + timedelta(hours=settings.PASSWORD_RESET_EXPIRY_HOURS)


async def send_email_via_api(to_email: str, to_name: str, subject: str, html_content: str) -> bool:
    """
    Send email using Brevo (Sendinblue) v3 HTTP API.
    Docs: https://developers.brevo.com/reference/sendtransacemail
    """
    url = "https://api.brevo.com/v3/smtp/email"
    
    headers = {
        "accept": "application/json",
        "api-key": settings.MAIL_PASSWORD,  # SMTP Key works as API Key
        "content-type": "application/json"
    }
    
    payload = {
        "sender": {
            "name": "VitalTrack",
            "email": settings.MAIL_FROM
        },
        "to": [
            {
                "email": to_email,
                "name": to_name
            }
        ],
        "subject": subject,
        "htmlContent": html_content
    }
    
    print(f"[EMAIL API] Sending to {to_email} via Brevo API...")
    
    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(url, json=payload, headers=headers, timeout=10.0)
            
        if response.status_code == 201:
            print(f"[EMAIL API] ✅ Success! Message ID: {response.json().get('messageId')}")
            return True
        else:
            print(f"[EMAIL API] ❌ Failed. Status: {response.status_code}, Response: {response.text}")
            return False
            
    except Exception as e:
        print(f"[EMAIL API] ❌ Exception: {str(e)}")
        return False


async def send_verification_email(email: EmailStr, username: str, token: str) -> bool:
    """Send verification email via API."""
    verification_url = f"{settings.FRONTEND_URL}/verify-email?token={token}"
    
    html_content = f"""
    <!DOCTYPE html>
    <html>
    <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
        <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
            <h2 style="color: #00D09C;">Welcome to VitalTrack!</h2>
            <p>Hi {username},</p>
            <p>Please verify your email address to complete your registration.</p>
            <p style="text-align: center; margin: 30px 0;">
                <a href="{verification_url}" style="background: #00D09C; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px;">Verify Email</a>
            </p>
            <p>Link: {verification_url}</p>
            <p><small>Expires in {settings.EMAIL_VERIFICATION_EXPIRY_HOURS} hours.</small></p>
        </div>
    </body>
    </html>
    """
    
    return await send_email_via_api(email, username, "Verify your VitalTrack account", html_content)


async def send_password_reset_email(email: EmailStr, username: str, token: str) -> bool:
    """Send password reset email via API."""
    reset_url = f"{settings.FRONTEND_URL}/reset-password?token={token}"
    
    html_content = f"""
    <!DOCTYPE html>
    <html>
    <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
        <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
            <h2 style="color: #FF6B6B;">Reset Password</h2>
            <p>Hi {username},</p>
            <p>Click the button below to reset your password.</p>
            <p style="text-align: center; margin: 30px 0;">
                <a href="{reset_url}" style="background: #FF6B6B; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px;">Reset Password</a>
            </p>
            <p>Link: {reset_url}</p>
            <p><small>Expires in {settings.PASSWORD_RESET_EXPIRY_HOURS} hour.</small></p>
        </div>
    </body>
    </html>
    """
    
    return await send_email_via_api(email, username, "Reset your VitalTrack password", html_content)


async def send_password_changed_notification(email: EmailStr, username: str) -> bool:
    """Send password changed notification via API."""
    html_content = f"""
    <!DOCTYPE html>
    <html>
    <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
        <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
            <h2 style="color: #00D09C;">Password Changed</h2>
            <p>Hi {username},</p>
            <p>Your password was successfully changed.</p>
            <p>If this wasn't you, please contact support immediately.</p>
        </div>
    </body>
    </html>
    """
    
    return await send_email_via_api(email, username, "Your VitalTrack password was changed", html_content)
