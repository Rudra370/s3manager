import os
from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker

# Import configuration (ensures env is loaded)
from app.config import DATABASE_URL, DEBUG_SQL

# Create engine with connection pooling for PostgreSQL
engine = create_engine(
    DATABASE_URL,
    pool_pre_ping=True,  # Verify connections before using them
    pool_size=5,         # Number of connections to keep open
    max_overflow=10,     # Additional connections if pool is exhausted
    echo=DEBUG_SQL       # Log SQL queries when DEBUG_SQL is enabled
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def get_db():
    """Get database session for dependency injection."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    """
    Initialize database tables.
    
    Note: In production, use Alembic migrations instead of this function.
    This is kept for backward compatibility during development.
    """
    Base.metadata.create_all(bind=engine)
