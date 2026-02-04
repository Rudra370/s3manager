"""Progress tracking for background tasks using Redis."""

import os
from enum import Enum
from typing import Optional, Any
from datetime import datetime, timedelta
import json
import redis
from pydantic import BaseModel

# Redis connection (use same as Celery broker)
redis_client = redis.Redis.from_url(os.getenv("CELERY_BROKER_URL", "redis://localhost:6379/0"), decode_responses=True)


class TaskStatus(str, Enum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class TaskProgress(BaseModel):
    task_id: str
    task_type: str  # "BACKGROUND" or "INLINE"
    status: TaskStatus
    progress: int  # 0-100
    current_step: Optional[str] = None
    metadata: dict = {}
    result: Optional[Any] = None
    error: Optional[dict] = None
    created_at: str
    updated_at: str
    expires_at: Optional[str] = None


class TaskProgressStore:
    """Store and retrieve task progress from Redis with TTL."""
    
    RUNNING_TTL = 300  # 5 minutes for running tasks
    COMPLETED_TTL = 30  # 30 seconds for completed/failed tasks
    
    @staticmethod
    def _key(task_id: str) -> str:
        return f"task_progress:{task_id}"
    
    @classmethod
    def create(cls, task_id: str, task_type: str, metadata: dict = None) -> TaskProgress:
        """Create initial progress entry."""
        now = datetime.utcnow()
        progress = TaskProgress(
            task_id=task_id,
            task_type=task_type,
            status=TaskStatus.PENDING,
            progress=0,
            metadata=metadata or {},
            created_at=now.isoformat(),
            updated_at=now.isoformat(),
            expires_at=(now + timedelta(seconds=cls.RUNNING_TTL)).isoformat()
        )
        cls._save(progress, cls.RUNNING_TTL)
        return progress
    
    @classmethod
    def update(cls, task_id: str, progress: int = None, current_step: str = None, status: TaskStatus = None):
        """Update progress and refresh TTL."""
        data = cls.get(task_id)
        if not data:
            return
        if progress is not None:
            data.progress = progress
        if status is not None:
            data.status = status
        else:
            data.status = TaskStatus.RUNNING
        if current_step:
            data.current_step = current_step
        data.updated_at = datetime.utcnow().isoformat()
        cls._save(data, cls.RUNNING_TTL)
    
    @classmethod
    def set_complete(cls, task_id: str, result: Any = None):
        """Mark task as complete with shorter TTL."""
        data = cls.get(task_id)
        if not data:
            return
        data.status = TaskStatus.COMPLETED
        data.progress = 100
        data.result = result
        data.updated_at = datetime.utcnow().isoformat()
        cls._save(data, cls.COMPLETED_TTL)
    
    # Alias for backward compatibility
    set_completed = set_complete
    
    @classmethod
    def set_failed(cls, task_id: str, error_message: str = None, error_details: dict = None, error: dict = None):
        """Mark task as failed."""
        data = cls.get(task_id)
        if not data:
            return
        data.status = TaskStatus.FAILED
        if error:
            # Support passing error dict directly (old interface)
            data.error = error
        else:
            data.error = {"message": error_message or "Unknown error", "details": error_details or {}}
        data.updated_at = datetime.utcnow().isoformat()
        cls._save(data, cls.COMPLETED_TTL)
    
    @classmethod
    def set_cancelled(cls, task_id: str):
        """Mark task as cancelled."""
        data = cls.get(task_id)
        if not data:
            return
        data.status = TaskStatus.CANCELLED
        data.updated_at = datetime.utcnow().isoformat()
        cls._save(data, cls.COMPLETED_TTL)
    
    @classmethod
    def get(cls, task_id: str) -> Optional[TaskProgress]:
        """Get progress by task ID."""
        key = cls._key(task_id)
        data = redis_client.get(key)
        if not data:
            return None
        return TaskProgress.parse_raw(data)
    
    @classmethod
    def _save(cls, progress: TaskProgress, ttl: int):
        """Save progress to Redis with TTL."""
        key = cls._key(progress.task_id)
        redis_client.setex(key, ttl, progress.json())
    
    @classmethod
    def delete(cls, task_id: str):
        """Delete progress entry."""
        redis_client.delete(cls._key(task_id))
