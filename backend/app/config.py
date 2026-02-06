"""
S3 Manager - Configuration Loader

Loads environment variables with support for:
- Base .env file (common settings)
- Environment-specific files (.env.local, .env.production)
- APP_ENV variable to control which environment to load
"""

import os
from pathlib import Path
from dotenv import load_dotenv


def load_environment():
    """
    Load environment variables from .env files.
    
    Loading order (later overrides earlier):
    1. .env (base configuration)
    2. .env.{APP_ENV} (environment-specific overrides)
    3. System environment variables (always highest priority)
    """
    # Get project root (parent of backend directory)
    backend_dir = Path(__file__).parent.parent
    project_root = backend_dir.parent
    
    # Determine environment
    # Check os.environ first (in case APP_ENV was set before this runs)
    env = os.environ.get("APP_ENV", "local")
    
    # 1. Load base .env file
    base_env = project_root / ".env"
    if base_env.exists():
        load_dotenv(base_env, override=False)
    
    # 2. Load environment-specific file (overrides base)
    env_file = project_root / f".env.{env}"
    if env_file.exists():
        load_dotenv(env_file, override=True)
    
    # Store the environment for later use
    os.environ.setdefault("APP_ENV", env)
    
    return env


def get_env(key: str, default=None, required: bool = False):
    """
    Get environment variable with optional default and required check.
    
    Args:
        key: Environment variable name
        default: Default value if not set
        required: If True, raises ValueError when not set
    
    Returns:
        The environment variable value or default
    
    Raises:
        ValueError: If required=True and variable is not set
    """
    value = os.getenv(key, default)
    if required and value is None:
        raise ValueError(f"Required environment variable '{key}' is not set")
    return value


def get_bool_env(key: str, default: bool = False) -> bool:
    """
    Get boolean environment variable.
    
    Values considered True: 'true', '1', 'yes', 'on'
    Values considered False: 'false', '0', 'no', 'off', ''
    """
    value = os.getenv(key, "").lower()
    if value in ("true", "1", "yes", "on"):
        return True
    if value in ("false", "0", "no", "off", ""):
        return False
    return default


def get_list_env(key: str, default=None, separator: str = ",") -> list:
    """Get list from comma-separated environment variable."""
    value = os.getenv(key, "")
    if not value:
        return default or []
    return [item.strip() for item in value.split(separator)]


# Load environment on module import
ENV = load_environment()

# Common configuration values
DEBUG = get_bool_env("DEBUG", default=False)
DEBUG_SQL = get_bool_env("DEBUG_SQL", default=False)
PORT = int(get_env("PORT", "3012"))
SECRET_KEY = get_env("SECRET_KEY", required=True)
DATABASE_URL = get_env("DATABASE_URL", required=True)
REDIS_URL = get_env("REDIS_URL", "redis://localhost:6379/0")
CELERY_BROKER_URL = get_env("CELERY_BROKER_URL", REDIS_URL)
CELERY_RESULT_BACKEND = get_env("CELERY_RESULT_BACKEND", REDIS_URL)
ALLOWED_ORIGINS = get_list_env("ALLOWED_ORIGINS", ["http://localhost:3012"])
