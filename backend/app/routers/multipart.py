"""
Multipart Upload Router - For handling large file uploads via S3 multipart API
"""

import logging
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Form
from sqlalchemy.orm import Session
from typing import Optional, List, Dict
from pydantic import BaseModel

from app.database import get_db
from app.models import User
from app.auth import get_current_active_user
from app.permissions import require_bucket_write
from app.s3_client import get_s3_manager_from_config
from app.utils import get_storage_config

router = APIRouter(prefix="/api/buckets/{bucket_name}/multipart", tags=["multipart"])
logger = logging.getLogger(__name__)

# Temporary storage for multipart upload metadata (compression status, etc.)
# In production, this should use Redis or database
# Key: upload_id, Value: dict with metadata
_upload_metadata: Dict[str, dict] = {}


# ========== Pydantic Models ==========

class InitiateUploadRequest(BaseModel):
    key: str
    storage_config_id: Optional[int] = None
    compressed: bool = False  # Whether parts will be gzip compressed


class InitiateUploadResponse(BaseModel):
    upload_id: str
    key: str
    bucket: str


class PartETag(BaseModel):
    part_number: int
    etag: str


class CompleteUploadRequest(BaseModel):
    upload_id: str
    key: str
    parts: List[PartETag]
    storage_config_id: Optional[int] = None
    compressed: bool = False  # Whether file was gzip compressed


class CompleteUploadResponse(BaseModel):
    success: bool
    location: str
    key: str
    size: Optional[int] = None
    compressed: bool = False


class AbortUploadRequest(BaseModel):
    upload_id: str
    key: str
    storage_config_id: Optional[int] = None


class UploadPartResponse(BaseModel):
    part_number: int
    etag: str


# ========== API Endpoints ==========

@router.post("/initiate", response_model=InitiateUploadResponse)
def initiate_multipart_upload(
    bucket_name: str,
    request: InitiateUploadRequest,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """
    Initiate a multipart upload session.
    Returns an upload_id that must be used for all subsequent part uploads.
    """
    logger.info(
        f"Multipart upload initiated: user={current_user.email}, bucket={bucket_name}, key={request.key}, compressed={request.compressed}",
        extra={"user_id": current_user.id, "bucket": bucket_name, "key": request.key, "compressed": request.compressed}
    )
    
    config = get_storage_config(db, request.storage_config_id)
    if not config:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="S3 storage configuration not found or inactive"
        )
    
    # Check write permission for this bucket
    require_bucket_write(current_user, config.id, bucket_name, db)
    
    s3_manager = get_s3_manager_from_config(config)
    
    upload_id, error = s3_manager.initiate_multipart_upload(bucket_name, request.key)
    
    if error:
        logger.error(
            f"Failed to initiate multipart upload: user={current_user.email}, error={error}",
            extra={"user_id": current_user.id, "bucket": bucket_name, "error_type": "s3_error"}
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to initiate upload: {error}"
        )
    
    # Store metadata about this upload (including compression status)
    _upload_metadata[upload_id] = {
        "bucket": bucket_name,
        "key": request.key,
        "compressed": request.compressed,
        "user_id": current_user.id,
        "storage_config_id": request.storage_config_id,
        "created_at": datetime.now(timezone.utc)
    }
    
    logger.info(
        f"Multipart upload initiated successfully: upload_id={upload_id}",
        extra={"user_id": current_user.id, "bucket": bucket_name, "upload_id": upload_id}
    )
    
    return InitiateUploadResponse(
        upload_id=upload_id,
        key=request.key,
        bucket=bucket_name
    )


@router.post("/upload", response_model=UploadPartResponse)
def upload_part(
    bucket_name: str,
    upload_id: str = Form(...),
    key: str = Form(...),
    part_number: int = Form(...),
    file: UploadFile = File(...),
    storage_config_id: Optional[int] = Form(default=None),
    compressed: bool = Form(default=False),
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """
    Upload a single part of a multipart upload.
    Part numbers must be between 1 and 10000.
    Each part except the last must be at least 5 MB.
    """
    config = get_storage_config(db, storage_config_id)
    if not config:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="S3 storage configuration not found or inactive"
        )
    
    # Check write permission for this bucket
    require_bucket_write(current_user, config.id, bucket_name, db)
    
    s3_manager = get_s3_manager_from_config(config)
    
    etag, error = s3_manager.upload_part(
        bucket_name=bucket_name,
        key=key,
        upload_id=upload_id,
        part_number=part_number,
        body=file.file
    )
    
    if error:
        logger.error(
            f"Failed to upload part: user={current_user.email}, part={part_number}, error={error}",
            extra={"user_id": current_user.id, "bucket": bucket_name, "part_number": part_number}
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to upload part {part_number}: {error}"
        )
    
    return UploadPartResponse(part_number=part_number, etag=etag)


@router.post("/complete", response_model=CompleteUploadResponse)
def complete_multipart_upload(
    bucket_name: str,
    request: CompleteUploadRequest,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """
    Complete a multipart upload by assembling all uploaded parts.
    Parts must be listed in order by part number.
    """
    logger.info(
        f"Completing multipart upload: user={current_user.email}, bucket={bucket_name}, key={request.key}, parts={len(request.parts)}, compressed={request.compressed}",
        extra={"user_id": current_user.id, "bucket": bucket_name, "key": request.key, "part_count": len(request.parts)}
    )
    
    config = get_storage_config(db, request.storage_config_id)
    if not config:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="S3 storage configuration not found or inactive"
        )
    
    # Check write permission for this bucket
    require_bucket_write(current_user, config.id, bucket_name, db)
    
    s3_manager = get_s3_manager_from_config(config)
    
    # Convert Pydantic models to dict format expected by S3 client
    parts = [{"PartNumber": p.part_number, "ETag": p.etag} for p in request.parts]
    
    result, error = s3_manager.complete_multipart_upload(
        bucket_name=bucket_name,
        key=request.key,
        upload_id=request.upload_id,
        parts=parts
    )
    
    if error:
        logger.error(
            f"Failed to complete multipart upload: user={current_user.email}, error={error}",
            extra={"user_id": current_user.id, "bucket": bucket_name, "error_type": "s3_error"}
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to complete upload: {error}"
        )
    
    # Store compression metadata if compressed
    if request.compressed:
        # Add metadata to the object indicating it's gzip compressed
        try:
            s3_manager._get_client().copy_object(
                Bucket=bucket_name,
                CopySource={'Bucket': bucket_name, 'Key': request.key},
                Key=request.key,
                Metadata={'x-amz-meta-compressed': 'gzip'},
                MetadataDirective='REPLACE'
            )
        except Exception as e:
            logger.warning(f"Failed to add compression metadata: {e}")
    
    # Clean up upload metadata
    if request.upload_id in _upload_metadata:
        del _upload_metadata[request.upload_id]
    
    logger.info(
        f"Multipart upload completed successfully: user={current_user.email}, location={result.get('Location', 'N/A')}",
        extra={"user_id": current_user.id, "bucket": bucket_name, "key": request.key}
    )
    
    return CompleteUploadResponse(
        success=True,
        location=result.get("Location", ""),
        key=request.key,
        size=result.get("Size"),
        compressed=request.compressed
    )


@router.delete("/abort")
def abort_multipart_upload(
    bucket_name: str,
    upload_id: str,
    key: str,
    storage_config_id: Optional[int] = None,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """
    Abort a multipart upload and delete all uploaded parts.
    Call this if the upload fails or is cancelled by the user.
    """
    logger.info(
        f"Aborting multipart upload: user={current_user.email}, bucket={bucket_name}, key={key}",
        extra={"user_id": current_user.id, "bucket": bucket_name, "key": key}
    )
    
    config = get_storage_config(db, storage_config_id)
    if not config:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="S3 storage configuration not found or inactive"
        )
    
    # Check write permission for this bucket
    require_bucket_write(current_user, config.id, bucket_name, db)
    
    s3_manager = get_s3_manager_from_config(config)
    
    success, error = s3_manager.abort_multipart_upload(
        bucket_name=bucket_name,
        key=key,
        upload_id=upload_id
    )
    
    if error:
        logger.error(
            f"Failed to abort multipart upload: user={current_user.email}, error={error}",
            extra={"user_id": current_user.id, "bucket": bucket_name, "error_type": "s3_error"}
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to abort upload: {error}"
        )
    
    # Clean up upload metadata
    if upload_id in _upload_metadata:
        del _upload_metadata[upload_id]
    
    logger.info(
        f"Multipart upload aborted successfully: user={current_user.email}",
        extra={"user_id": current_user.id, "bucket": bucket_name}
    )
    
    return {"success": True, "message": "Multipart upload aborted and parts cleaned up"}


@router.get("/threshold")
def get_multipart_threshold(
    current_user: User = Depends(get_current_active_user)
):
    """
    Get the file size threshold for using multipart upload.
    Files larger than this should use multipart upload.
    """
    from app.constants import MULTIPART_THRESHOLD
    return {
        "threshold_bytes": MULTIPART_THRESHOLD,
        "threshold_mb": MULTIPART_THRESHOLD / (1024 * 1024)
    }
