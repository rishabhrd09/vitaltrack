"""
VitalTrack Backend - API v1 Router
Combines all v1 API routes
"""

from fastapi import APIRouter

from app.api.v1 import auth, categories, items, orders, sync


router = APIRouter(prefix="/api/v1")

# Include all route modules
router.include_router(auth.router)
router.include_router(categories.router)
router.include_router(items.router)
router.include_router(orders.router)
router.include_router(sync.router)
