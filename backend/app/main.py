"""
S3 Manager - Self-hosted S3 compatible object storage UI
Backend: FastAPI
"""

import os
import re
import subprocess
import traceback
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse, HTMLResponse


from app.database import SessionLocal
from app.models import AppConfig
from app.routers import admin, auth, buckets, objects, users, shares, storage_configs, tasks
from app.logging_config import setup_logging, get_logger


def run_migrations():
    """Run Alembic migrations to ensure database is up to date."""
    logger = get_logger(__name__)
    logger.info("Running database migrations...")
    
    try:
        # Run alembic upgrade head
        result = subprocess.run(
            ["alembic", "upgrade", "head"],
            capture_output=True,
            text=True,
            cwd=os.path.dirname(os.path.dirname(__file__))  # backend directory
        )
        
        if result.returncode != 0:
            logger.error(f"Migration failed: {result.stderr}")
            raise RuntimeError(f"Database migration failed: {result.stderr}")
        
        logger.info("Database migrations completed successfully")
        if result.stdout:
            logger.debug(f"Migration output: {result.stdout}")
            
    except FileNotFoundError:
        logger.error("Alembic not found. Make sure alembic is installed.")
        raise
    except Exception as e:
        logger.error(f"Migration error: {e}", exc_info=True)
        raise


# Initialize database on startup
@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan handler."""
    # Setup logging first
    setup_logging()
    logger = get_logger(__name__)
    
    # Startup
    logger.info("Application startup initiated")
    try:
        run_migrations()
        logger.info("Database initialized successfully")
    except Exception as e:
        logger.error(f"Database initialization failed: {e}", exc_info=True)
        raise
    
    logger.info("Application startup complete")
    yield
    
    # Shutdown
    logger.info("Application shutdown initiated")

app = FastAPI(
    title="S3 Manager",
    description="Self-hosted S3 compatible object storage UI",
    version="1.0.0",
    lifespan=lifespan
)

# CORS middleware - allow frontend to access API with credentials
app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("ALLOWED_ORIGINS", "http://localhost:3012").split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(admin.router)
app.include_router(auth.router)
app.include_router(buckets.router)
app.include_router(objects.router)
app.include_router(users.router)
app.include_router(shares.router)
app.include_router(storage_configs.router)
app.include_router(tasks.router)


# Health check
@app.get("/api/health")
def health_check():
    """Health check endpoint."""
    return {"status": "healthy"}


# Global exception handler for 500 errors - returns full traceback
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """Global exception handler that returns full traceback for 500 errors."""
    logger = get_logger(__name__)
    
    # Get full traceback
    tb_str = traceback.format_exc()
    
    # Log the error
    logger.error(f"Unhandled exception: {exc}\n{tb_str}")
    
    # Return JSON response with traceback
    return JSONResponse(
        status_code=500,
        content={
            "detail": "An internal server error occurred",
            "traceback": tb_str,
            "error_type": type(exc).__name__,
            "error_message": str(exc)
        }
    )


def get_app_config_for_html():
    """Get app config from database for HTML template."""
    try:
        db = SessionLocal()
        config = db.query(AppConfig).first()
        if config:
            return {
                "heading_text": config.heading_text or "S3 Manager",
                "logo_url": config.logo_url
            }
        return {"heading_text": "S3 Manager", "logo_url": None}
    except Exception:
        return {"heading_text": "S3 Manager", "logo_url": None}
    finally:
        db.close()


def generate_index_html():
    """Generate index.html with embedded app config."""
    static_dir = os.path.join(os.path.dirname(__file__), "static")
    index_file = os.path.join(static_dir, "index.html")
    
    # Read the original index.html
    with open(index_file, 'r', encoding='utf-8') as f:
        html_content = f.read()
    
    # Get app config
    config = get_app_config_for_html()
    heading_text = config.get("heading_text", "S3 Manager")
    logo_url = config.get("logo_url")
    
    # Replace title
    html_content = re.sub(r'<title>[^<]*</title>', f'<title>{heading_text}</title>', html_content)
    
    # Replace favicon
    if logo_url:
        # Use custom logo as favicon
        html_content = re.sub(
            r'<link rel="icon"[^>]*>',
            f'<link rel="icon" href="{logo_url}" />',
            html_content
        )
    
    return html_content


# Mount static files (React build) if they exist
static_dir = os.path.join(os.path.dirname(__file__), "static")
if os.path.exists(static_dir):
    app.mount("/assets", StaticFiles(directory=os.path.join(static_dir, "assets")), name="assets")
    
    # Public share access route - serves React app which handles the share UI
    @app.get("/s/{token}")
    def serve_share_page(token: str):
        """Serve React app for share links."""
        index_file = os.path.join(static_dir, "index.html")
        if os.path.exists(index_file):
            html_content = generate_index_html()
            return HTMLResponse(content=html_content)
        return JSONResponse(
            status_code=404,
            content={"error": "Frontend not built."}
        )
    
    @app.get("/{path:path}")
    def serve_react(path: str):
        """Serve React app for all non-API routes."""
        # Don't serve React for API routes or share links (handled above)
        if path.startswith("api/") or path.startswith("s/"):
            raise HTTPException(status_code=404, detail="Not found")
        
        index_file = os.path.join(static_dir, "index.html")
        if os.path.exists(index_file):
            # Serve dynamic HTML with embedded config
            html_content = generate_index_html()
            return HTMLResponse(content=html_content)
        return JSONResponse(
            status_code=404,
            content={"error": "Frontend not built. Run 'npm run build' in frontend directory."}
        )


if __name__ == "__main__":
    import uvicorn
    
    port = int(os.getenv("PORT", 8000))
    host = os.getenv("HOST", "0.0.0.0")
    debug = os.getenv("FLASK_DEBUG", "false").lower() == "true"
    
    uvicorn.run("app.main:app", host=host, port=port, reload=debug)
