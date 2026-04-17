"""
VitalTrack Backend - Main Application
FastAPI application with middleware, CORS, rate limiting, and lifecycle events
"""

from contextlib import asynccontextmanager
from datetime import datetime, timezone

from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from sqlalchemy.exc import IntegrityError

from app.api.v1 import router as api_v1_router
from app.core.config import settings
from app.core.database import create_tables, dispose_engine
from app.schemas import HealthCheck
from app.utils.rate_limiter import limiter

import logging

# Configure structured logging (12-Factor: treat logs as event streams)
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("vitaltrack.main")


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
            expose_headers=["X-Total-Count", "X-Page", "X-Page-Size"],
        )
    else:
        # Production mode: Specific origins with credentials
        logger.info(f"CORS: Production mode — specific origins: {settings.CORS_ORIGINS}")
        app.add_middleware(
            CORSMiddleware,
            allow_origins=settings.CORS_ORIGINS,
            allow_credentials=True,
            allow_methods=["*"],
            allow_headers=["*"],
            expose_headers=["X-Total-Count", "X-Page", "X-Page-Size"],
        )
    
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
        if settings.ENVIRONMENT == "production":
            response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        return response

    # Include API routers
    app.include_router(api_v1_router)
    
    # Configure rate limiter
    app.state.limiter = limiter
    app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
    
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
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
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
def register_health_endpoints(app: FastAPI) -> None:
    """Register health check endpoints."""
    
    @app.get(
        "/health",
        response_model=HealthCheck,
        tags=["Health"],
        summary="Health check",
    )
    async def health_check() -> HealthCheck:
        """
        Check application health status.
        
        Returns basic health information including version and environment.
        """
        return HealthCheck(
            status="healthy",
            version=settings.APP_VERSION,
            environment=settings.ENVIRONMENT,
            database="connected",
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
        log_level="debug" if settings.DEBUG else "info",
    )
