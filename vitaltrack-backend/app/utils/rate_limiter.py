"""
VitalTrack Backend - Rate Limiting
Prevent brute force attacks on authentication endpoints
"""

from slowapi import Limiter
from slowapi.util import get_remote_address

# Create limiter instance using client IP
limiter = Limiter(key_func=get_remote_address)
