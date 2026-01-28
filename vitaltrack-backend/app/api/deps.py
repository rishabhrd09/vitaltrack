"""
VitalTrack Backend - API Dependencies
Common dependencies for route handlers
"""

from typing import Annotated, Optional

from fastapi import Depends, Header, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import verify_access_token
from app.models.user import User


# =============================================================================
# SECURITY SCHEME
# =============================================================================
security = HTTPBearer(auto_error=False)


# =============================================================================
# AUTHENTICATION DEPENDENCIES
# =============================================================================
async def get_current_user(
    db: Annotated[AsyncSession, Depends(get_db)],
    credentials: Annotated[
        Optional[HTTPAuthorizationCredentials],
        Depends(security),
    ],
) -> User:
    """
    Get the current authenticated user.
    
    Raises:
        HTTPException: If not authenticated or user not found
    """
    if not credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    user_id = verify_access_token(credentials.credentials)
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    result = await db.execute(
        select(User).where(User.id == user_id)
    )
    user = result.scalar_one_or_none()
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account is disabled",
        )
    
    return user


async def get_current_active_user(
    user: Annotated[User, Depends(get_current_user)],
) -> User:
    """
    Get the current active user (verified account not required).
    """
    return user


async def get_current_verified_user(
    user: Annotated[User, Depends(get_current_user)],
) -> User:
    """
    Get the current verified user.
    
    Raises:
        HTTPException: If user is not verified
    """
    if not user.is_verified:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Email verification required",
        )
    return user


async def get_current_superuser(
    user: Annotated[User, Depends(get_current_user)],
) -> User:
    """
    Get the current superuser.
    
    Raises:
        HTTPException: If user is not a superuser
    """
    if not user.is_superuser:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Superuser access required",
        )
    return user


# =============================================================================
# OPTIONAL AUTHENTICATION
# =============================================================================
async def get_optional_user(
    db: Annotated[AsyncSession, Depends(get_db)],
    credentials: Annotated[
        Optional[HTTPAuthorizationCredentials],
        Depends(security),
    ],
) -> Optional[User]:
    """
    Get the current user if authenticated, None otherwise.
    """
    if not credentials:
        return None
    
    user_id = verify_access_token(credentials.credentials)
    if not user_id:
        return None
    
    result = await db.execute(
        select(User).where(User.id == user_id)
    )
    user = result.scalar_one_or_none()
    
    if user and user.is_active:
        return user
    
    return None


# =============================================================================
# PAGINATION DEPENDENCIES
# =============================================================================
class PaginationParams:
    """Common pagination parameters."""
    
    def __init__(
        self,
        page: int = 1,
        page_size: int = 20,
    ):
        self.page = max(1, page)
        self.page_size = max(1, min(100, page_size))
        self.offset = (self.page - 1) * self.page_size
        self.limit = self.page_size


# =============================================================================
# TYPE ALIASES
# =============================================================================
CurrentUser = Annotated[User, Depends(get_current_user)]
ActiveUser = Annotated[User, Depends(get_current_active_user)]
VerifiedUser = Annotated[User, Depends(get_current_verified_user)]
SuperUser = Annotated[User, Depends(get_current_superuser)]
OptionalUser = Annotated[Optional[User], Depends(get_optional_user)]
DB = Annotated[AsyncSession, Depends(get_db)]
Pagination = Annotated[PaginationParams, Depends()]
