import logging
from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Form, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from typing import Optional, List
from urllib.parse import unquote


from app.database import get_db
from app.models import User
from app.schemas import ObjectList, BulkDeleteRequest, PrefixCreate, CopyMoveRequest, CopyMoveResponse
from app.auth import get_current_active_user
from app.permissions import require_bucket_read, require_bucket_write
from app.s3_client import get_s3_manager_from_config
from app.utils import get_storage_config
from app.utils.formatting import format_size
from app.tasks.copy_tasks import copy_objects_task
from app.tasks.progress import TaskProgressStore

router = APIRouter(prefix="/api/buckets/{bucket_name}", tags=["objects"])
logger = logging.getLogger(__name__)

# Constants
DEFAULT_PAGE_SIZE = 100
MAX_PAGE_SIZE = 1000
DOWNLOAD_CHUNK_SIZE = 8192


@router.get("/objects", response_model=ObjectList)
def list_objects(
    bucket_name: str,
    prefix: str = Query(default=""),
    delimiter: str = Query(default="/"),
    max_keys: int = Query(default=DEFAULT_PAGE_SIZE, le=MAX_PAGE_SIZE),
    continuation_token: Optional[str] = Query(default=None),
    storage_config_id: Optional[int] = Query(default=None, description="Storage config ID (uses default if not provided)"),
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """List objects in a bucket."""
    config = get_storage_config(db, storage_config_id)
    if not config:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="S3 not configured"
        )
    
    # Check read permission for this bucket
    require_bucket_read(current_user, config.id, bucket_name, db)
    
    s3_manager = get_s3_manager_from_config(config)
    
    result, error = s3_manager.list_objects(
        bucket_name=bucket_name,
        prefix=prefix,
        delimiter=delimiter,
        max_keys=max_keys,
        continuation_token=continuation_token
    )
    
    if error:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to list objects: {error}"
        )
    
    return result


@router.post("/upload")
def upload_object(
    bucket_name: str,
    file: UploadFile = File(...),
    prefix: str = Form(default=""),
    storage_config_id: Optional[int] = Form(default=None),
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Upload an object to a bucket."""
    logger.info(
        f"Upload initiated: user={current_user.email}, bucket={bucket_name}, "
        f"filename={file.filename}, prefix={prefix}",
        extra={"user_id": current_user.id, "bucket": bucket_name, "operation": "upload"}
    )
    config = get_storage_config(db, storage_config_id)
    if not config:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="S3 not configured"
        )
    
    # Check write permission for this bucket
    require_bucket_write(current_user, config.id, bucket_name, db)
    
    s3_manager = get_s3_manager_from_config(config)
    
    key = prefix + file.filename if prefix else file.filename
    
    success, error = s3_manager.upload_object(
        bucket_name=bucket_name,
        key=key,
        file_content=file.file,
        content_type=file.content_type
    )
    
    if not success:
        logger.error(
            f"Upload failed: user={current_user.email}, bucket={bucket_name}, key={key}, error={error}",
            extra={"user_id": current_user.id, "bucket": bucket_name, "operation": "upload", "error_type": "s3_error"}
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to upload object: {error}"
        )
    
    logger.info(
        f"Upload successful: user={current_user.email}, bucket={bucket_name}, key={key}",
        extra={"user_id": current_user.id, "bucket": bucket_name, "operation": "upload"}
    )
    
    return {
        "success": True,
        "message": f'File "{file.filename}" uploaded successfully',
        "key": key
    }


@router.get("/objects/{object_key:path}/metadata")
def get_object_metadata(
    bucket_name: str,
    object_key: str,
    storage_config_id: Optional[int] = Query(default=None, description="Storage config ID (uses default if not provided)"),
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Get object metadata."""
    config = get_storage_config(db, storage_config_id)
    if not config:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="S3 not configured"
        )
    
    # Check read permission for this bucket
    require_bucket_read(current_user, config.id, bucket_name, db)
    
    s3_manager = get_s3_manager_from_config(config)
    
    object_key = unquote(object_key)
    metadata, error = s3_manager.get_object_metadata(bucket_name, object_key)
    
    if error:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Object not found: {error}"
        )
    
    return metadata


@router.get("/objects/{object_key:path}/download")
def download_object(
    bucket_name: str,
    object_key: str,
    storage_config_id: Optional[int] = Query(default=None, description="Storage config ID (uses default if not provided)"),
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Download an object."""
    config = get_storage_config(db, storage_config_id)
    if not config:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="S3 not configured"
        )
    
    # Check read permission for this bucket
    require_bucket_read(current_user, config.id, bucket_name, db)
    
    s3_manager = get_s3_manager_from_config(config)
    
    object_key = unquote(object_key)
    response, error = s3_manager.download_object(bucket_name, object_key)
    
    if error:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Object not found: {error}"
        )
    
    filename = object_key.split('/')[-1]
    
    def generate():
        for chunk in response['Body'].iter_chunks(chunk_size=DOWNLOAD_CHUNK_SIZE):
            yield chunk
    
    return StreamingResponse(
        generate(),
        media_type=response.get('ContentType', 'application/octet-stream'),
        headers={
            'Content-Disposition': f'attachment; filename="{filename}"'
        }
    )


@router.delete("/objects/{object_key:path}")
def delete_object(
    bucket_name: str,
    object_key: str,
    storage_config_id: Optional[int] = Query(default=None, description="Storage config ID (uses default if not provided)"),
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Delete an object."""
    logger.info(
        f"Delete initiated: user={current_user.email}, bucket={bucket_name}, key={object_key}",
        extra={"user_id": current_user.id, "bucket": bucket_name, "operation": "delete_object"}
    )
    config = get_storage_config(db, storage_config_id)
    if not config:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="S3 not configured"
        )
    
    # Check write permission for this bucket
    require_bucket_write(current_user, config.id, bucket_name, db)
    
    s3_manager = get_s3_manager_from_config(config)
    
    object_key = unquote(object_key)
    success, error = s3_manager.delete_object(bucket_name, object_key)
    
    if not success:
        logger.error(
            f"Delete failed: user={current_user.email}, bucket={bucket_name}, key={object_key}, error={error}",
            extra={"user_id": current_user.id, "bucket": bucket_name, "operation": "delete_object", "error_type": "s3_error"}
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to delete object: {error}"
        )
    
    logger.info(
        f"Delete successful: user={current_user.email}, bucket={bucket_name}, key={object_key}",
        extra={"user_id": current_user.id, "bucket": bucket_name, "operation": "delete_object"}
    )
    
    return {
        "success": True,
        "message": f'Object "{object_key}" deleted successfully'
    }


@router.post("/bulk-delete")
def bulk_delete_objects(
    bucket_name: str,
    request: BulkDeleteRequest,
    storage_config_id: Optional[int] = Query(default=None, description="Storage config ID (uses default if not provided)"),
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Delete multiple objects."""
    logger.info(
        f"Bulk delete initiated: user={current_user.email}, bucket={bucket_name}, count={len(request.keys)}",
        extra={"user_id": current_user.id, "bucket": bucket_name, "operation": "bulk_delete", "object_count": len(request.keys)}
    )
    config = get_storage_config(db, storage_config_id)
    if not config:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="S3 not configured"
        )
    
    # Check write permission for this bucket
    require_bucket_write(current_user, config.id, bucket_name, db)
    
    s3_manager = get_s3_manager_from_config(config)
    
    deleted, error = s3_manager.delete_objects(bucket_name, request.keys)
    
    if error:
        logger.error(
            f"Bulk delete failed: user={current_user.email}, bucket={bucket_name}, error={error}",
            extra={"user_id": current_user.id, "bucket": bucket_name, "operation": "bulk_delete", "error_type": "s3_error"}
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to delete objects: {error}"
        )
    
    logger.info(
        f"Bulk delete successful: user={current_user.email}, bucket={bucket_name}, deleted={len(deleted)}",
        extra={"user_id": current_user.id, "bucket": bucket_name, "operation": "bulk_delete", "deleted_count": len(deleted)}
    )
    
    return {
        "success": True,
        "deleted_count": len(deleted),
        "message": f'{len(deleted)} objects deleted successfully'
    }


@router.post("/prefix")
def create_prefix(
    bucket_name: str,
    request: PrefixCreate,
    storage_config_id: Optional[int] = Query(default=None, description="Storage config ID (uses default if not provided)"),
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Create a folder/prefix."""
    config = get_storage_config(db, storage_config_id)
    if not config:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="S3 not configured"
        )
    
    # Check write permission for this bucket
    require_bucket_write(current_user, config.id, bucket_name, db)
    
    s3_manager = get_s3_manager_from_config(config)
    
    success, error = s3_manager.create_prefix(bucket_name, request.prefix)
    
    if not success:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to create folder: {error}"
        )
    
    return {
        "success": True,
        "message": f'Folder "{request.prefix}" created successfully'
    }


@router.delete("/prefix/{prefix:path}")
def delete_prefix(
    bucket_name: str,
    prefix: str,
    storage_config_id: Optional[int] = Query(default=None, description="Storage config ID (uses default if not provided)"),
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Delete a prefix and all its contents."""
    config = get_storage_config(db, storage_config_id)
    if not config:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="S3 not configured"
        )
    
    # Check write permission for this bucket
    require_bucket_write(current_user, config.id, bucket_name, db)
    
    s3_manager = get_s3_manager_from_config(config)
    
    prefix = unquote(prefix)
    deleted_count, error = s3_manager.delete_prefix(bucket_name, prefix)
    
    if error:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to delete folder: {error}"
        )
    
    return {
        "success": True,
        "deleted_count": deleted_count,
        "message": f'Folder "{prefix}" and {deleted_count} objects deleted successfully'
    }


@router.get("/prefix/{prefix:path}/size")
def get_prefix_size(
    bucket_name: str,
    prefix: str,
    storage_config_id: Optional[int] = Query(default=None, description="Storage config ID (uses default if not provided)"),
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Calculate total size of a prefix."""
    config = get_storage_config(db, storage_config_id)
    if not config:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="S3 not configured"
        )
    
    # Check read permission for this bucket
    require_bucket_read(current_user, config.id, bucket_name, db)
    
    s3_manager = get_s3_manager_from_config(config)
    
    prefix = unquote(prefix)
    size, error = s3_manager.calculate_size(bucket_name, prefix)
    
    if error:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to calculate size: {error}"
        )
    
    return {
        "size": size,
        "size_formatted": format_size(size),
        "prefix": prefix
    }


@router.get("/search")
def search_objects(
    bucket_name: str,
    query: str = Query(..., description="Search query"),
    prefix: str = Query(default=""),
    storage_config_id: Optional[int] = Query(default=None, description="Storage config ID (uses default if not provided)"),
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Search for objects by name."""
    config = get_storage_config(db, storage_config_id)
    if not config:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="S3 not configured"
        )
    
    # Check read permission for this bucket
    require_bucket_read(current_user, config.id, bucket_name, db)
    
    s3_manager = get_s3_manager_from_config(config)
    
    # List all objects (paginated) and filter
    all_objects = []
    continuation_token = None
    
    while True:
        result, error = s3_manager.list_objects(
            bucket_name=bucket_name,
            prefix=prefix,
            delimiter="",
            max_keys=MAX_PAGE_SIZE,
            continuation_token=continuation_token
        )
        
        if error:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Failed to search objects: {error}"
            )
        
        # Filter by query
        for obj in result.get('objects', []):
            if query.lower() in obj['name'].lower():
                all_objects.append(obj)
        
        if not result.get('is_truncated'):
            break
        
        continuation_token = result.get('next_continuation_token')
        
        # Limit to first 100 matches for performance
        if len(all_objects) >= 100:
            break
    
    return {
        "objects": all_objects[:100],
        "total_found": len(all_objects),
        "query": query
    }


@router.post("/copy-move", response_model=CopyMoveResponse)
def copy_move_objects(
    bucket_name: str,
    request: CopyMoveRequest,
    storage_config_id: Optional[int] = Query(default=None, description="Storage config ID (uses default if not provided)"),
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """
    Copy or move objects to another bucket/storage config.
    
    This endpoint initiates a background task for the copy/move operation
    and returns immediately with a task ID for progress tracking.
    """
    logger.info(
        f"Copy/move initiated: user={current_user.email}, operation={request.operation}, "
        f"source={request.source_bucket}, dest={request.dest_bucket}",
        extra={
            "user_id": current_user.id,
            "operation": request.operation,
            "source_bucket": request.source_bucket,
            "dest_bucket": request.dest_bucket
        }
    )
    
    # Verify storage configs exist
    source_config = get_storage_config(db, request.source_storage_config_id)
    if not source_config:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Source S3 storage not configured"
        )
    
    dest_config = get_storage_config(db, request.dest_storage_config_id)
    if not dest_config:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Destination S3 storage not configured"
        )
    
    # Check read permission on source bucket
    require_bucket_read(current_user, request.source_storage_config_id, request.source_bucket, db)
    
    # Check write permission on destination bucket
    require_bucket_write(current_user, request.dest_storage_config_id, request.dest_bucket, db)
    
    # Validate that destination bucket exists
    dest_s3_manager = get_s3_manager_from_config(dest_config)
    dest_buckets, error = dest_s3_manager.list_buckets()
    if error:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to verify destination bucket: {error}"
        )
    
    bucket_exists = any(b['name'] == request.dest_bucket for b in dest_buckets)
    if not bucket_exists:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Destination bucket '{request.dest_bucket}' does not exist in the selected storage"
        )
    
    # Validate operation
    if request.operation not in ["copy", "move"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Operation must be 'copy' or 'move'"
        )
    
    # Validate source keys
    if not request.source_keys:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No source keys provided"
        )
    
    # Always use background task for copy/move to avoid HTTP timeouts
    # Even small operations can take time due to S3 latency, listing, etc.
    # This ensures consistent behavior and better UX with progress tracking
    task = copy_objects_task.delay(
        source_storage_config_id=request.source_storage_config_id,
        source_bucket=request.source_bucket,
        source_keys=request.source_keys,
        dest_storage_config_id=request.dest_storage_config_id,
        dest_bucket=request.dest_bucket,
        dest_prefix=request.dest_prefix,
        operation=request.operation,
        overwrite=request.overwrite,
        user_id=current_user.id
    )
    
    logger.info(
        f"Copy/move task started: task_id={task.id}, "
        f"user={current_user.email}, keys={len(request.source_keys)}",
        extra={
            "user_id": current_user.id,
            "task_id": task.id,
            "operation": request.operation
        }
    )
    
    return CopyMoveResponse(
        task_id=task.id,
        status="pending",
        message=f"{request.operation} operation started. Use /api/tasks/{task.id} to track progress."
    )
