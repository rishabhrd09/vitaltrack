"""
VitalTrack Backend - Main Application
FastAPI application with middleware, CORS, rate limiting, and lifecycle events
"""

import asyncio
from contextlib import asynccontextmanager
from datetime import datetime, timezone

from fastapi import FastAPI, Request, status
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi.errors import RateLimitExceeded
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError

from app.api.v1 import router as api_v1_router
from app.services.ai_body_limit import AIBodyLimit
from app.services.ingress import IngressGuard, RequestCapacity, validate_ingress_settings
from app.core.config import settings
from app.core.database import create_tables, dispose_engine, get_db_context
from app.core.logging import configure_safe_logging, scrub_telemetry_event
from app.schemas import HealthCheck
from app.utils.rate_limiter import limiter, rate_limit_exceeded_handler
from app.utils.request_ids import safe_request_id

import logging

configure_safe_logging()

# Configure structured logging (12-Factor: treat logs as event streams)
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("vitaltrack.main")

# Error tracking — only active when SENTRY_DSN is configured (OBS-1).
if settings.SENTRY_DSN:
    try:
        import sentry_sdk

        sentry_sdk.init(
            dsn=settings.SENTRY_DSN,
            environment=settings.ENVIRONMENT,
            traces_sample_rate=0.1,
            send_default_pii=False,
            max_request_body_size="never",
            include_local_variables=False,
            # No trace or baggage headers on outbound calls to AI providers (Groq, Sarvam).
            trace_propagation_targets=[],
            before_send=scrub_telemetry_event,
            before_send_transaction=scrub_telemetry_event,
        )
        logger.info("Sentry error tracking initialised")
    except Exception:  # pragma: no cover - telemetry must never break startup
        logger.exception("Failed to initialise Sentry")

DATABASE_HEALTH_TIMEOUT_SECONDS = 2.0


# =============================================================================
# APPLICATION LIFECYCLE
# =============================================================================
@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifecycle manager."""
    # Startup
    logger.info(f"Starting {settings.APP_NAME} v{settings.APP_VERSION}")
    logger.info(f"Environment: {settings.ENVIRONMENT}")
    logger.info(f"CORS Origins: {settings.CORS_ORIGINS}")
    logger.info(f"CORS Allow All: {settings.is_cors_allow_all}")
    
    # In development, create tables automatically
    if settings.ENVIRONMENT == "development":
        await create_tables()
        logger.info("Database tables created/verified")
    
    yield
    
    # Shutdown
    logger.info("Shutting down...")
    await dispose_engine()


# =============================================================================
# APPLICATION FACTORY
# =============================================================================
def create_app() -> FastAPI:
    """Create and configure the FastAPI application."""

    # Match the hosted/local boundary used by ingress and rate-limit validation.
    # Check presence only: startup must not depend on a live Brevo request.
    if (
        settings.ENVIRONMENT not in {"development", "testing"}
        and settings.REQUIRE_EMAIL_VERIFICATION
        and not settings.mail_password_value.strip()
    ):
        raise RuntimeError(
            "Hosted email verification requires a nonblank MAIL_PASSWORD "
            "(Brevo API key). Configure email credentials before starting the backend."
        )

    validate_ingress_settings(settings)
    app = FastAPI(
        title=settings.APP_NAME,
        version=settings.APP_VERSION,
        description="Medical inventory management API for CareKosh",
        docs_url="/docs" if settings.DEBUG else None,
        redoc_url="/redoc" if settings.DEBUG else None,
        openapi_url="/openapi.json" if settings.DEBUG else None,
        lifespan=lifespan,
    )
    
    # ==========================================================================
    # CORS CONFIGURATION - CRITICAL FOR MOBILE APPS
    # ==========================================================================
    # IMPORTANT: CORS spec does NOT allow credentials with wildcard origins
    # For development with ["*"], we disable credentials (mobile apps don't need it)
    # For production, use specific origins with credentials enabled
    # ==========================================================================
    
    if settings.WEB_AUTH_ENABLED:
        if settings.is_cors_allow_all or not settings.WEB_APP_ORIGINS or not set(settings.WEB_APP_ORIGINS).issubset(set(settings.CORS_ORIGINS)):
            raise RuntimeError("Browser auth requires explicit WEB_APP_ORIGINS included in CORS_ORIGINS")
        if settings.ENVIRONMENT in {"production", "staging"} and any(not origin.startswith("https://") for origin in settings.WEB_APP_ORIGINS):
            raise RuntimeError("Hosted browser auth requires HTTPS origins")

    # =========================================================================
    # CORRELATION ID — stamp every request/response with X-Request-ID (OBS-1)
    # =========================================================================
    @app.middleware("http")
    async def add_request_id(request: Request, call_next):
        request_id = safe_request_id(request.headers.get("X-Request-ID"))
        response = await call_next(request)
        response.headers["X-Request-ID"] = request_id
        if request.url.path.startswith("/api/v1/web-auth/"):
            response.headers["Cache-Control"] = "no-store"
            response.headers["Pragma"] = "no-cache"
        return response

    # =========================================================================
    # SECURITY HEADERS (OWASP recommended)
    # =========================================================================
    @app.middleware("http")
    async def add_security_headers(request: Request, call_next):
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Cache-Control"] = "no-store"
        if settings.ENVIRONMENT in {"production", "staging"}:
            response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        return response

    # Include API routers
    app.include_router(api_v1_router)
    app.add_middleware(AIBodyLimit, api_timeout=settings.API_BODY_TIMEOUT_SECONDS)
    app.add_middleware(RequestCapacity, maximum=settings.MAX_INFLIGHT_REQUESTS)
    app.add_middleware(IngressGuard, config=settings.model_copy(deep=True))

    # CORS wraps admission/body refusals so allowed browser clients see their
    # status and Retry-After. It does not authenticate native clients.
    if settings.is_cors_allow_all:
        # Development mode: Allow all origins but disable credentials
        # This is safe for local dev and works with mobile apps
        logger.warning("CORS: Development mode — allowing all origins")
        app.add_middleware(
            CORSMiddleware,
            allow_origins=["*"],
            allow_credentials=False,  # MUST be False with wildcard
            allow_methods=["*"],
            allow_headers=["*"],
            expose_headers=["X-Total-Count", "X-Page", "X-Page-Size", "Retry-After", "X-AI-Error", "X-Request-ID"],
        )
    else:
        # Production mode: Specific origins with credentials
        logger.info(f"CORS: Production mode — specific origins: {settings.CORS_ORIGINS}")
        app.add_middleware(
            CORSMiddleware,
            allow_origins=settings.CORS_ORIGINS,
            allow_credentials=True,
            allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
            allow_headers=["Authorization", "Content-Type", "X-CareKosh-Web", "X-Request-ID"],
            expose_headers=["X-Total-Count", "X-Page", "X-Page-Size", "Retry-After", "X-AI-Error", "X-Request-ID"],
        )
    
    # Configure rate limiter
    app.state.limiter = limiter
    app.add_exception_handler(RateLimitExceeded, rate_limit_exceeded_handler)
    
    # Register exception handlers
    register_exception_handlers(app)
    
    # Register health check endpoints
    register_health_endpoints(app)
    
    return app


# =============================================================================
# EXCEPTION HANDLERS
# =============================================================================
def register_exception_handlers(app: FastAPI) -> None:
    """Register custom exception handlers."""
    
    @app.exception_handler(RequestValidationError)
    async def validation_exception_handler(
        request: Request,
        exc: RequestValidationError,
    ) -> JSONResponse:
        """Handle validation errors with detailed messages."""
        errors = []
        for error in exc.errors():
            errors.append({
                "field": ".".join(str(loc) for loc in error["loc"]),
                "message": error["msg"],
                "code": error["type"],
            })
        
        return JSONResponse(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            content={
                "error": "Validation Error",
                "message": "Request validation failed",
                "details": errors,
                "timestamp": datetime.now(timezone.utc).isoformat(),
            },
        )

    @app.exception_handler(IntegrityError)
    async def integrity_error_handler(
        request: Request,
        exc: IntegrityError,
    ) -> JSONResponse:
        """Handle database conflicts without exposing SQL details."""
        logger.exception("Database integrity error")

        return JSONResponse(
            status_code=status.HTTP_409_CONFLICT,
            content={
                "detail": "A conflict occurred. Please try again.",
                "timestamp": datetime.now(timezone.utc).isoformat(),
            },
        )
    
    @app.exception_handler(Exception)
    async def general_exception_handler(
        request: Request,
        exc: Exception,
    ) -> JSONResponse:
        """Handle unexpected errors."""
        logger.exception("Unhandled exception")
        
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content={
                "detail": "An unexpected error occurred. Please try again.",
                "timestamp": datetime.now(timezone.utc).isoformat(),
            },
        )


# =============================================================================
# HEALTH ENDPOINTS
# =============================================================================
async def _run_database_readiness_probe() -> None:
    async with get_db_context() as db:
        result = await db.execute(text("SELECT 1"))
        result.scalar_one()


async def check_database_readiness(
    timeout_seconds: float = DATABASE_HEALTH_TIMEOUT_SECONDS,
) -> bool:
    try:
        await asyncio.wait_for(_run_database_readiness_probe(), timeout=timeout_seconds)
    except Exception:
        logger.exception("Database readiness probe failed")
        return False
    return True


def register_health_endpoints(app: FastAPI) -> None:
    """Register health check endpoints."""
    
    @app.get(
        "/health",
        response_model=HealthCheck,
        responses={status.HTTP_503_SERVICE_UNAVAILABLE: {"model": HealthCheck}},
        tags=["Health"],
        summary="Readiness check",
    )
    async def health_check() -> HealthCheck | JSONResponse:
        """
        Check application readiness, including database connectivity.
        
        Returns 200 only when the database probe succeeds.
        """
        is_ready = await check_database_readiness()
        health = HealthCheck(
            status="healthy" if is_ready else "unhealthy",
            version=settings.APP_VERSION,
            environment=settings.ENVIRONMENT,
            database="connected" if is_ready else "unavailable",
            timestamp=datetime.now(timezone.utc),
        )

        if not is_ready:
            return JSONResponse(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                content=jsonable_encoder(health),
            )

        return health

    @app.get(
        "/live",
        response_model=HealthCheck,
        tags=["Health"],
        summary="Liveness check",
    )
    async def liveness_check() -> HealthCheck:
        """
        Check whether the application process is alive without probing the DB.
        """
        return HealthCheck(
            status="healthy",
            version=settings.APP_VERSION,
            environment=settings.ENVIRONMENT,
            database="not_checked",
            timestamp=datetime.now(timezone.utc),
        )
    
    @app.get(
        "/",
        tags=["Health"],
        summary="Root endpoint",
    )
    async def root():
        """Root endpoint with API information."""
        return {
            "name": settings.APP_NAME,
            "version": settings.APP_VERSION,
            "docs": "/docs" if settings.DEBUG else None,
            "health": "/health",
            "live": "/live",
            "api": "/api/v1",
            "cors_mode": "allow_all" if settings.is_cors_allow_all else "restricted",
        }


# =============================================================================
# CREATE APPLICATION INSTANCE
# =============================================================================
app = create_app()


# =============================================================================
# MAIN ENTRY POINT
# =============================================================================
if __name__ == "__main__":
    import uvicorn
    
    uvicorn.run(
        "app.main:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=settings.DEBUG,
        # IngressGuard must see the real socket peer before trusting headers.
        proxy_headers=False,
        log_level="debug" if settings.DEBUG else "info",
    )
