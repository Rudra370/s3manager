"""
Utility functions for the S3 Manager backend.
"""

from typing import Optional
from sqlalchemy.orm import Session

from app.models import StorageConfig


def get_storage_config(db: Session, storage_config_id: Optional[int] = None) -> Optional[StorageConfig]:
    """Get Storage configuration from database.
    
    If storage_config_id is provided, returns that specific config.
    Otherwise, returns the first active config as default.
    """
    if storage_config_id:
        return db.query(StorageConfig).filter(
            StorageConfig.id == storage_config_id,
            StorageConfig.is_active == True
        ).first()
    # Return first active config as default
    return db.query(StorageConfig).filter(StorageConfig.is_active == True).first()
