"""Base Celery task with progress tracking."""

import os
import uuid
from celery import Task
from celery.exceptions import SoftTimeLimitExceeded
from .progress import TaskProgressStore, TaskStatus


class ProgressTask(Task):
    """Base task class with progress tracking support."""
    
    abstract = True  # Don't register this as a concrete task
    
    def __init__(self):
        super().__init__()
        self._task_progress_id = None
    
    def apply_async(self, args=None, kwargs=None, **options):
        """Override to generate task ID if not provided."""
        if 'task_id' not in options:
            options['task_id'] = str(uuid.uuid4())
        return super().apply_async(args=args, kwargs=kwargs, **options)
    
    def __call__(self, *args, **kwargs):
        """Called when task starts executing."""
        self._task_progress_id = self.request.id
        return self.run(*args, **kwargs)
    
    def update_progress(self, progress: int, current_step: str = None):
        """Update task progress."""
        import logging
        logger = logging.getLogger(__name__)
        logger.info(f"[update_progress] task_id={self._task_progress_id}, progress={progress}, step={current_step}")
        if self._task_progress_id:
            TaskProgressStore.update(self._task_progress_id, progress, current_step)
            logger.info(f"[update_progress] Updated successfully")
        else:
            logger.warning(f"[update_progress] No task_progress_id!")
    
    def set_complete(self, result=None):
        """Mark task as complete."""
        import logging
        logger = logging.getLogger(__name__)
        logger.info(f"[set_complete] task_id={self._task_progress_id}")
        if self._task_progress_id:
            TaskProgressStore.set_complete(self._task_progress_id, result)
    
    def set_failed(self, error_message: str, error_details: dict = None):
        """Mark task as failed."""
        import logging
        logger = logging.getLogger(__name__)
        logger.info(f"[set_failed] task_id={self._task_progress_id}, error={error_message}")
        if self._task_progress_id:
            TaskProgressStore.set_failed(self._task_progress_id, error_message, error_details)
    
    def is_cancelled(self) -> bool:
        """Check if task has been cancelled."""
        if not self._task_progress_id:
            return False
        progress = TaskProgressStore.get(self._task_progress_id)
        return progress and progress.status == TaskStatus.CANCELLED
