"""
Logging configuration for S3 Manager backend.

Provides structured logging with different formats for development and production.
Never logs sensitive data like passwords, secret keys, or file contents.
"""

import logging
import logging.handlers
import json
import os
import sys
from datetime import datetime
from typing import Any, Dict


class JSONFormatter(logging.Formatter):
    """Custom JSON formatter for structured logging in production."""
    
    def format(self, record: logging.LogRecord) -> str:
        """Format log record as JSON."""
        log_data: Dict[str, Any] = {
            "timestamp": datetime.utcnow().isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }
        
        # Add extra fields if present
        if hasattr(record, "user_id"):
            log_data["user_id"] = record.user_id
        if hasattr(record, "bucket"):
            log_data["bucket"] = record.bucket
        if hasattr(record, "operation"):
            log_data["operation"] = record.operation
        if hasattr(record, "duration_ms"):
            log_data["duration_ms"] = record.duration_ms
        if hasattr(record, "error_type"):
            log_data["error_type"] = record.error_type
        
        # Add exception info if present
        if record.exc_info:
            log_data["exception"] = self.formatException(record.exc_info)
        
        return json.dumps(log_data, default=str)


class ColoredConsoleFormatter(logging.Formatter):
    """Colored formatter for development console output."""
    
    # ANSI color codes
    COLORS = {
        "DEBUG": "\033[36m",      # Cyan
        "INFO": "\033[32m",       # Green
        "WARNING": "\033[33m",    # Yellow
        "ERROR": "\033[31m",      # Red
        "CRITICAL": "\033[35m",   # Magenta
        "RESET": "\033[0m",       # Reset
    }
    
    def __init__(self, fmt: str = None, datefmt: str = None, use_colors: bool = True):
        super().__init__(fmt, datefmt)
        self.use_colors = use_colors
    
    def format(self, record: logging.LogRecord) -> str:
        """Format log record with optional colors."""
        # Save original levelname
        original_levelname = record.levelname
        
        if self.use_colors and sys.stdout.isatty():
            # Add color to levelname
            color = self.COLORS.get(record.levelname, self.COLORS["RESET"])
            reset = self.COLORS["RESET"]
            record.levelname = f"{color}{record.levelname}{reset}"
        
        result = super().format(record)
        
        # Restore original levelname
        record.levelname = original_levelname
        
        return result


def setup_logging() -> None:
    """
    Configure application-wide logging.
    
    Uses different configurations based on environment:
    - Development: Colored console output with detailed formatting
    - Production: JSON structured logging to stdout
    
    Log levels can be controlled via LOG_LEVEL environment variable.
    """
    # Determine environment
    is_development = os.getenv("ENVIRONMENT", "development").lower() == "development"
    log_level_name = os.getenv("LOG_LEVEL", "DEBUG" if is_development else "INFO")
    log_level = getattr(logging, log_level_name.upper(), logging.INFO)
    
    # Create root logger configuration
    root_logger = logging.getLogger()
    root_logger.setLevel(log_level)
    
    # Clear any existing handlers
    root_logger.handlers = []
    
    # Create console handler
    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setLevel(log_level)
    
    if is_development:
        # Development: Colored, human-readable format
        formatter = ColoredConsoleFormatter(
            fmt="%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
            datefmt="%Y-%m-%d %H:%M:%S",
            use_colors=True
        )
    else:
        # Production: JSON structured logging
        formatter = JSONFormatter()
    
    console_handler.setFormatter(formatter)
    root_logger.addHandler(console_handler)
    
    # Configure third-party library log levels to reduce noise
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
    logging.getLogger("uvicorn.error").setLevel(logging.INFO)
    logging.getLogger("sqlalchemy.engine").setLevel(logging.WARNING)
    logging.getLogger("boto3").setLevel(logging.WARNING)
    logging.getLogger("botocore").setLevel(logging.WARNING)
    logging.getLogger("urllib3").setLevel(logging.WARNING)
    
    # Log configuration complete
    logger = logging.getLogger(__name__)
    logger.info(
        f"Logging configured: level={log_level_name}, "
        f"environment={'development' if is_development else 'production'}, "
        f"format={'colored' if is_development else 'json'}"
    )


def get_logger(name: str) -> logging.Logger:
    """
    Get a logger instance with the given name.
    
    Usage:
        logger = get_logger(__name__)
        logger.info("Message", extra={"user_id": 123, "bucket": "my-bucket"})
    """
    return logging.getLogger(name)
