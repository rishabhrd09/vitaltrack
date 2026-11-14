"""
VitalTrack Backend - API v1 Router
Combines all v1 API routes
"""

from fastapi import APIRouter

from app.api.v1 import activity, ai, auth, categories, items, openai_keys, orders, sarvam_keys, supply_reviews, web_auth


router = APIRouter(prefix="/api/v1")

# Include all route modules
ROUTERS = (
    auth.router,
    web_auth.router,
    categories.router,
    items.router,
    orders.router,
    activity.router,
    ai.router,
    sarvam_keys.router,
    openai_keys.router,
    supply_reviews.router,
)
for module_router in ROUTERS:
    router.include_router(module_router)


def declared_routes():
    """Every /api/v1 route as (full path, route object).

    FastAPI no longer flattens included routers into app.routes, so route
    inventories read the module routers, which hold only APIRoute objects.
    """
    return [
        (router.prefix + route.path, route)
        for module_router in ROUTERS
        for route in module_router.routes
    ]
