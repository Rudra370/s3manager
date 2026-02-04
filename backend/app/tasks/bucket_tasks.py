"""Background tasks for bucket operations."""

from celery import shared_task
from celery.exceptions import SoftTimeLimitExceeded
from .base import ProgressTask
from .progress import TaskProgressStore
from ..s3_client import get_s3_manager_cached
from ..database import SessionLocal
from ..models import SharedLink
from ..utils.formatting import format_size
import logging

logger = logging.getLogger(__name__)


def get_s3_client(storage_config_id: int = None):
    """Get S3 client for tasks (uses cached manager)."""
    return get_s3_manager_cached(storage_config_id=storage_config_id)


@shared_task(bind=True, base=ProgressTask, max_retries=3)
def delete_bucket_task(self, bucket_name: str, storage_config_id: int = None, user_id: int = None):
    """Delete a bucket and all its contents in the background."""
    task_id = self.request.id
    logger.info(f"Starting delete_bucket_task: task_id={task_id}, bucket={bucket_name}, storage_config_id={storage_config_id}, user_id={user_id}")
    
    try:
        # Verify progress entry exists
        progress = TaskProgressStore.get(task_id)
        if not progress:
            logger.error(f"No progress entry found for task {task_id}")
            # Create one now as fallback
            TaskProgressStore.create(
                task_id=task_id,
                task_type="BACKGROUND",
                metadata={"bucket_name": bucket_name, "action": "delete_bucket"}
            )
        
        logger.info(f"Getting S3 client for storage_config_id={storage_config_id}")
        s3 = get_s3_client(storage_config_id)
        logger.info(f"S3 client obtained successfully")
        
        # Step 1: List all objects
        self.update_progress(5, "Listing objects...")
        paginator = s3._get_client().get_paginator('list_objects_v2')
        object_keys = []
        for page in paginator.paginate(Bucket=bucket_name):
            if 'Contents' in page:
                object_keys.extend([obj['Key'] for obj in page['Contents']])
        
        total_objects = len(object_keys)
        if total_objects == 0:
            self.update_progress(50, "No objects to delete")
        else:
            self.update_progress(10, f"Found {total_objects} objects")
        
        # Step 2: Delete objects in batches
        batch_size = 100
        deleted = 0
        for i in range(0, len(object_keys), batch_size):
            if self.is_cancelled():
                logger.info(f"Task {self.request.id} cancelled")
                return {"status": "cancelled", "deleted": deleted}
            
            batch = object_keys[i:i + batch_size]
            s3._get_client().delete_objects(
                Bucket=bucket_name,
                Delete={'Objects': [{'Key': k} for k in batch]}
            )
            deleted += len(batch)
            progress = 10 + int((deleted / total_objects) * 70) if total_objects > 0 else 50
            self.update_progress(progress, f"Deleted {deleted}/{total_objects} objects")
        
        # Step 3: Delete bucket
        self.update_progress(85, "Deleting bucket...")
        s3._get_client().delete_bucket(Bucket=bucket_name)
        
        # Step 4: Clean up share links (database operation)
        self.update_progress(95, "Cleaning up...")
        db = SessionLocal()
        try:
            db.query(SharedLink).filter(
                SharedLink.bucket_name == bucket_name,
                SharedLink.storage_config_id == storage_config_id
            ).delete(synchronize_session=False)
            db.commit()
        finally:
            db.close()
        
        self.set_complete({"deleted": deleted, "bucket": bucket_name})
        return {"status": "completed", "deleted": deleted}
        
    except SoftTimeLimitExceeded:
        logger.error(f"Task {task_id} timed out")
        self.set_failed("Task timed out")
        raise
    except Exception as e:
        logger.exception(f"Delete bucket task {task_id} failed: {e}")
        self.set_failed(str(e))
        raise


@shared_task(bind=True, base=ProgressTask, max_retries=3)
def bulk_delete_task(self, bucket_name: str, keys: list, storage_config_id: int = None):
    """Delete multiple objects in the background. Handles both files and folders (prefixes)."""
    try:
        s3 = get_s3_client(storage_config_id)
        
        # Separate folders (ending with /) from files
        folders = [k for k in keys if k.endswith('/')]
        files = [k for k in keys if not k.endswith('/')]
        
        self.update_progress(5, "Preparing deletion...")
        
        # Expand folders to get all objects inside them
        all_keys_to_delete = list(files)
        if folders:
            self.update_progress(10, f"Expanding {len(folders)} folders...")
            paginator = s3._get_client().get_paginator('list_objects_v2')
            for folder_prefix in folders:
                for page in paginator.paginate(Bucket=bucket_name, Prefix=folder_prefix):
                    if 'Contents' in page:
                        all_keys_to_delete.extend([obj['Key'] for obj in page['Contents']])
        
        total = len(all_keys_to_delete)
        if total == 0:
            self.set_complete({"deleted": 0})
            return {"status": "completed", "deleted": 0}
        
        self.update_progress(15, f"Deleting {total} objects...")
        
        batch_size = 100
        deleted = 0
        for i in range(0, total, batch_size):
            if self.is_cancelled():
                return {"status": "cancelled", "deleted": deleted}
            
            batch = all_keys_to_delete[i:i + batch_size]
            s3._get_client().delete_objects(
                Bucket=bucket_name,
                Delete={'Objects': [{'Key': k} for k in batch]}
            )
            deleted += len(batch)
            progress = 15 + int((deleted / total) * 85)
            self.update_progress(progress, f"Deleted {deleted}/{total} objects")
        
        self.set_complete({"deleted": deleted, "folders": len(folders), "files": len(files)})
        return {"status": "completed", "deleted": deleted}
        
    except Exception as e:
        logger.exception("Bulk delete task failed")
        self.set_failed(str(e))
        raise


@shared_task(bind=True, base=ProgressTask, max_retries=3)
def calculate_size_task(self, bucket_name: str, prefix: str = "", storage_config_id: int = None):
    """Calculate total size of bucket or folder."""
    task_id = self.request.id
    logger.info(f"[calculate_size_task] START task_id={task_id}, bucket={bucket_name}, storage_config_id={storage_config_id}")
    
    try:
        logger.info(f"[calculate_size_task] Getting S3 client for storage_config_id={storage_config_id}")
        s3 = get_s3_client(storage_config_id)
        logger.info(f"[calculate_size_task] Got S3 client: {s3}")
        
        # First, count total objects
        logger.info(f"[calculate_size_task] Updating progress to 5%")
        self.update_progress(5, "Counting objects...")
        logger.info(f"[calculate_size_task] Getting paginator")
        paginator = s3._get_client().get_paginator('list_objects_v2')
        logger.info(f"[calculate_size_task] Got paginator, starting count")
        
        params = {'Bucket': bucket_name}
        if prefix:
            params['Prefix'] = prefix
        
        # Count objects first
        total_count = 0
        logger.info(f"[calculate_size_task] Starting object count")
        for page in paginator.paginate(**params):
            if 'Contents' in page:
                total_count += len(page['Contents'])
        logger.info(f"[calculate_size_task] Count complete: {total_count} objects")
        
        logger.info(f"[calculate_size_task] Updating progress to 10%")
        self.update_progress(10, f"Found {total_count} objects, calculating size...")
        logger.info(f"[calculate_size_task] Starting size calculation")
        
        # Now calculate size with progress updates
        total_size = 0
        count = 0
        last_progress = 10
        
        for page in paginator.paginate(**params):
            if 'Contents' in page:
                for obj in page['Contents']:
                    total_size += obj['Size']
                    count += 1
                    
                    # Update progress every 10 objects
                    if count % 10 == 0 and total_count > 0:
                        progress = 10 + int((count / total_count) * 80)
                        if progress > last_progress:
                            self.update_progress(progress, f"Scanning {count}/{total_count} objects...")
                            last_progress = progress
        
        # Format size for display
        size_formatted = format_size(total_size)
        
        logger.info(f"[calculate_size_task] Calculation complete: {count} objects, {size_formatted}")
        self.set_complete({
            "size_bytes": total_size,
            "size_formatted": size_formatted,
            "object_count": count
        })
        logger.info(f"[calculate_size_task] END task_id={task_id}")
        return {"size_bytes": total_size, "size_formatted": size_formatted, "count": count}
        
    except Exception as e:
        logger.exception(f"[calculate_size_task] FAILED: {e}")
        self.set_failed(str(e))
        raise


@shared_task(bind=True, base=ProgressTask, max_retries=3)
def delete_prefix_task(self, bucket_name: str, prefix: str, storage_config_id: int = None, user_id: int = None):
    """Delete a folder (prefix) and all its contents in the background."""
    task_id = self.request.id
    logger.info(f"Starting delete_prefix_task: task_id={task_id}, bucket={bucket_name}, prefix={prefix}, storage_config_id={storage_config_id}")
    
    try:
        # Verify progress entry exists
        progress = TaskProgressStore.get(task_id)
        if not progress:
            logger.error(f"No progress entry found for task {task_id}")
            TaskProgressStore.create(
                task_id=task_id,
                task_type="BACKGROUND",
                metadata={"bucket_name": bucket_name, "prefix": prefix, "action": "delete_prefix"}
            )
        
        s3 = get_s3_client(storage_config_id)
        
        # Step 1: List all objects with this prefix
        self.update_progress(5, "Listing objects in folder...")
        paginator = s3._get_client().get_paginator('list_objects_v2')
        object_keys = []
        
        for page in paginator.paginate(Bucket=bucket_name, Prefix=prefix):
            if 'Contents' in page:
                object_keys.extend([obj['Key'] for obj in page['Contents']])
        
        total_objects = len(object_keys)
        if total_objects == 0:
            self.update_progress(90, "Folder is empty")
        else:
            self.update_progress(10, f"Found {total_objects} objects")
        
        # Step 2: Delete objects in batches
        batch_size = 100
        deleted = 0
        for i in range(0, len(object_keys), batch_size):
            if self.is_cancelled():
                logger.info(f"Task {task_id} cancelled")
                return {"status": "cancelled", "deleted": deleted}
            
            batch = object_keys[i:i + batch_size]
            s3._get_client().delete_objects(
                Bucket=bucket_name,
                Delete={'Objects': [{'Key': k} for k in batch]}
            )
            deleted += len(batch)
            progress = 10 + int((deleted / total_objects) * 85) if total_objects > 0 else 90
            self.update_progress(progress, f"Deleted {deleted}/{total_objects} objects")
        
        self.set_complete({"deleted": deleted, "prefix": prefix})
        logger.info(f"delete_prefix_task completed: {deleted} objects deleted")
        return {"status": "completed", "deleted": deleted}
        
    except Exception as e:
        logger.exception(f"Delete prefix task {task_id} failed: {e}")
        self.set_failed(str(e))
        raise
