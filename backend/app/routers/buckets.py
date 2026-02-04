"""
Buckets Router - S3 Bucket Operations with Hierarchical Permissions
"""

import logging
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from typing import Optional

from app.database import get_db
from app.models import User
from app.schemas import BucketList, BucketCreate
from app.auth import get_current_active_user, get_current_admin_user
from app.permissions import (
    require_storage_read,
    require_bucket_read,
    filter_buckets_by_permission
)
from app.s3_client import get_s3_manager_from_config
from app.utils import get_storage_config
from app.utils.formatting import format_size

router = APIRouter(prefix="/api/buckets", tags=["buckets"])
logger = logging.getLogger(__name__)


@router.get("", response_model=BucketList)
def list_buckets(
    storage_config_id: Optional[int] = Query(default=None, description="Storage config ID (uses default if not provided)"),
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """List S3 buckets the user has access to."""
    config = get_storage_config(db, storage_config_id)
    if not config:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="S3 storage configuration not found or inactive"
        )
    
    # Check storage-level read permission
    require_storage_read(current_user, config.id, db)
    
    s3_manager = get_s3_manager_from_config(config)
    
    buckets, error = s3_manager.list_buckets()
    if error:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to list buckets: {error}"
        )
    
    # Filter buckets based on user's bucket-level permissions
    filtered_buckets = filter_buckets_by_permission(
        current_user, buckets, config.id, db
    )
    
    return {"buckets": filtered_buckets}


@router.post("")
def create_bucket(
    bucket_data: BucketCreate,
    storage_config_id: Optional[int] = Query(default=None, description="Storage config ID (uses default if not provided)"),
    current_user: User = Depends(get_current_admin_user),
    db: Session = Depends(get_db)
):
    """Create a new S3 bucket (admin only)."""
    logger.info(
        f"Bucket creation initiated: user={current_user.email}, bucket={bucket_data.name}",
        extra={"user_id": current_user.id, "bucket": bucket_data.name, "operation": "create_bucket"}
    )
    config = get_storage_config(db, storage_config_id)
    if not config:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="S3 storage configuration not found or inactive"
        )
    
    s3_manager = get_s3_manager_from_config(config)
    
    success, error = s3_manager.create_bucket(bucket_data.name)
    if not success:
        logger.error(
            f"Bucket creation failed: user={current_user.email}, bucket={bucket_data.name}, error={error}",
            extra={"user_id": current_user.id, "bucket": bucket_data.name, "operation": "create_bucket", "error_type": "s3_error"}
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to create bucket: {error}"
        )
    
    logger.info(
        f"Bucket created successfully: user={current_user.email}, bucket={bucket_data.name}",
        extra={"user_id": current_user.id, "bucket": bucket_data.name, "operation": "create_bucket"}
    )
    
    return {
        "success": True,
        "message": f'Bucket "{bucket_data.name}" created successfully',
        "storage_config_id": config.id
    }


@router.delete("/{bucket_name}")
def delete_bucket(
    bucket_name: str,
    storage_config_id: Optional[int] = Query(default=None, description="Storage config ID (uses default if not provided)"),
    current_user: User = Depends(get_current_admin_user),
    db: Session = Depends(get_db)
):
    """Delete an S3 bucket (admin only)."""
    logger.info(
        f"Bucket deletion initiated: user={current_user.email}, bucket={bucket_name}",
        extra={"user_id": current_user.id, "bucket": bucket_name, "operation": "delete_bucket"}
    )
    config = get_storage_config(db, storage_config_id)
    if not config:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="S3 storage configuration not found or inactive"
        )
    
    s3_manager = get_s3_manager_from_config(config)
    
    success, error = s3_manager.delete_bucket(bucket_name)
    if not success:
        logger.error(
            f"Bucket deletion failed: user={current_user.email}, bucket={bucket_name}, error={error}",
            extra={"user_id": current_user.id, "bucket": bucket_name, "operation": "delete_bucket", "error_type": "s3_error"}
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to delete bucket: {error}"
        )
    
    logger.info(
        f"Bucket deleted successfully: user={current_user.email}, bucket={bucket_name}",
        extra={"user_id": current_user.id, "bucket": bucket_name, "operation": "delete_bucket"}
    )
    
    return {
        "success": True,
        "message": f'Bucket "{bucket_name}" deleted successfully'
    }


@router.get("/{bucket_name}/size")
def get_bucket_size(
    bucket_name: str,
    storage_config_id: Optional[int] = Query(default=None, description="Storage config ID (uses default if not provided)"),
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Calculate total size of a bucket."""
    config = get_storage_config(db, storage_config_id)
    if not config:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="S3 storage configuration not found or inactive"
        )
    
    # Check storage-level read permission first
    require_storage_read(current_user, config.id, db)
    
    # Then check bucket-level access (will raise 403 if no access)
    require_bucket_read(current_user, config.id, bucket_name, db)
    
    s3_manager = get_s3_manager_from_config(config)
    
    size, error = s3_manager.calculate_size(bucket_name)
    if error:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to calculate size: {error}"
        )
    
    return {
        "size": size,
        "size_formatted": format_size(size),
        "storage_config_id": config.id
    }
