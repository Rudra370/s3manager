"""API endpoints for background task management."""

import uuid
import logging
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

logger = logging.getLogger(__name__)

from app.celery_app import celery_app
from app.auth import get_current_user
from app.models import User
from app.task_progress import TaskProgressStore, TaskStatus

router = APIRouter(prefix="/api/tasks", tags=["tasks"])


# Pydantic models for API requests/responses
class StartTaskResponse(BaseModel):
    task_id: str
    status: str
    message: str


class TaskProgressResponse(BaseModel):
    task_id: str
    task_type: str
    status: str
    progress: int
    current_step: Optional[str]
    result: Optional[Any]
    error: Optional[Dict]


class BucketDeleteRequest(BaseModel):
    storage_config_id: Optional[int] = None


class BulkDeleteRequest(BaseModel):
    bucket_name: str
    keys: List[str]
    storage_config_id: Optional[int] = None


class CalculateSizeRequest(BaseModel):
    bucket_name: str
    prefix: Optional[str] = ""
    storage_config_id: Optional[int] = None


@router.post("/bucket-delete/{bucket_name}", response_model=StartTaskResponse)
async def start_bucket_delete(
    bucket_name: str,
    request: BucketDeleteRequest,
    current_user: User = Depends(get_current_user)
):
    """Start a background task to delete a bucket."""
    # Create progress entry first
    task_id = str(uuid.uuid4())
    storage_config_id = request.storage_config_id
    
    TaskProgressStore.create(
        task_id=task_id,
        task_type="BACKGROUND",
        metadata={
            "bucket_name": bucket_name,
            "storage_config_id": storage_config_id,
            "user_id": current_user.id,
            "action": "delete_bucket"
        }
    )
    
    # Start Celery task with same ID
    from app.tasks import delete_bucket_task
    logger.info(f"Starting delete_bucket_task: task_id={task_id}, bucket={bucket_name}, storage_config_id={storage_config_id}")
    delete_bucket_task.apply_async(
        kwargs={
            'bucket_name': bucket_name,
            'storage_config_id': storage_config_id,
            'user_id': current_user.id
        },
        task_id=task_id
    )
    
    return StartTaskResponse(
        task_id=task_id,
        status="started",
        message=f"Bucket deletion started for '{bucket_name}'"
    )


@router.post("/bulk-delete", response_model=StartTaskResponse)
async def start_bulk_delete(
    request: BulkDeleteRequest,
    current_user: User = Depends(get_current_user)
):
    """Start a background task to delete multiple objects."""
    if not request.keys:
        raise HTTPException(status_code=400, detail="No keys provided")
    
    task_id = str(uuid.uuid4())
    TaskProgressStore.create(
        task_id=task_id,
        task_type="BACKGROUND",
        metadata={
            "bucket_name": request.bucket_name,
            "object_count": len(request.keys),
            "user_id": current_user.id,
            "action": "bulk_delete"
        }
    )
    
    from app.tasks import bulk_delete_task
    logger.info(f"Starting bulk_delete_task: task_id={task_id}, bucket={request.bucket_name}, storage_config_id={request.storage_config_id}")
    bulk_delete_task.apply_async(
        kwargs={
            'bucket_name': request.bucket_name,
            'keys': request.keys,
            'storage_config_id': request.storage_config_id
        },
        task_id=task_id
    )
    
    return StartTaskResponse(
        task_id=task_id,
        status="started",
        message=f"Bulk delete started for {len(request.keys)} objects"
    )


@router.post("/calculate-size", response_model=StartTaskResponse)
async def start_calculate_size(
    request: CalculateSizeRequest,
    current_user: User = Depends(get_current_user)
):
    """Start a background task to calculate folder/bucket size."""
    task_id = str(uuid.uuid4())
    TaskProgressStore.create(
        task_id=task_id,
        task_type="INLINE",
        metadata={
            "bucket_name": request.bucket_name,
            "prefix": request.prefix,
            "storage_config_id": request.storage_config_id,
            "user_id": current_user.id,
            "action": "calculate_size"
        }
    )
    
    from app.tasks import calculate_size_task
    logger.info(f"Starting calculate_size_task: task_id={task_id}, bucket={request.bucket_name}, storage_config_id={request.storage_config_id}")
    calculate_size_task.apply_async(
        kwargs={
            'bucket_name': request.bucket_name,
            'prefix': request.prefix or "",
            'storage_config_id': request.storage_config_id
        },
        task_id=task_id
    )
    
    return StartTaskResponse(
        task_id=task_id,
        status="started",
        message="Size calculation started"
    )


@router.get("/{task_id}/progress", response_model=TaskProgressResponse)
async def get_task_progress(
    task_id: str,
    current_user: User = Depends(get_current_user)
):
    """Get the current progress of a task."""
    progress = TaskProgressStore.get(task_id)
    
    if not progress:
        raise HTTPException(status_code=404, detail="Task not found or expired")
    
    # Security: Check user owns this task
    if progress.metadata.get("user_id") != current_user.id and not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Access denied")
    
    return TaskProgressResponse(
        task_id=progress.task_id,
        task_type=progress.task_type,
        status=progress.status.value,
        progress=progress.progress,
        current_step=progress.current_step,
        result=progress.result,
        error=progress.error
    )


@router.delete("/{task_id}/cancel")
async def cancel_task(
    task_id: str,
    current_user: User = Depends(get_current_user)
):
    """Cancel a running task."""
    progress = TaskProgressStore.get(task_id)
    
    if not progress:
        raise HTTPException(status_code=404, detail="Task not found")
    
    if progress.metadata.get("user_id") != current_user.id and not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Access denied")
    
    # Only cancel if still running
    if progress.status.value not in ["pending", "running"]:
        return {"status": "already_done", "message": "Task already completed"}
    
    # Revoke Celery task
    celery_app.control.revoke(task_id, terminate=True)
    
    # Update progress
    TaskProgressStore.set_cancelled(task_id)
    
    return {"status": "cancelled", "message": "Task cancelled"}


@router.get("/active", response_model=List[TaskProgressResponse])
async def get_active_tasks(
    current_user: User = Depends(get_current_user)
):
    """Get all active (non-completed) tasks for current user."""
    active_tasks = []
    
    for task in TaskProgressStore._tasks.values():
        # Filter by user (or allow admins to see all)
        if task.metadata.get("user_id") == current_user.id or current_user.is_admin:
            # Only include non-completed tasks
            if task.status.value in ["pending", "running"]:
                active_tasks.append(TaskProgressResponse(
                    task_id=task.task_id,
                    task_type=task.task_type,
                    status=task.status.value,
                    progress=task.progress,
                    current_step=task.current_step,
                    result=task.result,
                    error=task.error
                ))
    
    return active_tasks


class PrefixDeleteRequest(BaseModel):
    prefix: str
    storage_config_id: Optional[int] = None


@router.post("/prefix-delete/{bucket_name}", response_model=StartTaskResponse)
async def start_prefix_delete(
    bucket_name: str,
    request: PrefixDeleteRequest,
    current_user: User = Depends(get_current_user)
):
    """Start a background task to delete a folder (prefix) and all its contents."""
    task_id = str(uuid.uuid4())
    storage_config_id = request.storage_config_id
    
    TaskProgressStore.create(
        task_id=task_id,
        task_type="BACKGROUND",
        metadata={
            "bucket_name": bucket_name,
            "prefix": request.prefix,
            "storage_config_id": storage_config_id,
            "user_id": current_user.id,
            "action": "delete_prefix"
        }
    )
    
    from app.tasks import delete_prefix_task
    logger.info(f"Starting delete_prefix_task: task_id={task_id}, bucket={bucket_name}, prefix={request.prefix}, storage_config_id={storage_config_id}")
    delete_prefix_task.apply_async(
        kwargs={
            'bucket_name': bucket_name,
            'prefix': request.prefix,
            'storage_config_id': storage_config_id,
            'user_id': current_user.id
        },
        task_id=task_id
    )
    
    return StartTaskResponse(
        task_id=task_id,
        status="started",
        message=f"Folder deletion started for '{request.prefix}'"
    )
