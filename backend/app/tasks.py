"""
Background tasks for S3 Manager
"""

from datetime import datetime
from typing import Optional
from app.celery_app import celery_app
from app.database import SessionLocal
from app.models import SharedLink
from app.task_progress import TaskProgressStore, TaskStatus


@celery_app.task(bind=True, max_retries=3)
def cleanup_expired_shares(self):
    """
    Delete expired shareable links from database.
    Runs periodically via Celery beat.
    """
    db = SessionLocal()
    try:
        # Find all expired shares
        expired_shares = db.query(SharedLink).filter(
            SharedLink.expires_at < datetime.utcnow(),
            SharedLink.expires_at.isnot(None)
        ).all()
        
        count = len(expired_shares)
        
        # Delete them
        for share in expired_shares:
            db.delete(share)
        
        db.commit()
        
        return {
            "success": True,
            "deleted_count": count,
            "message": f"Deleted {count} expired shares"
        }
    except Exception as exc:
        db.rollback()
        # Retry after 5 minutes
        raise self.retry(exc=exc, countdown=300)
    finally:
        db.close()


@celery_app.task(bind=True, max_retries=3)
def delete_share_task(self, share_id: int):
    """
    Delete a specific share by ID (used for immediate revocation)
    """
    db = SessionLocal()
    try:
        share = db.query(SharedLink).filter(SharedLink.id == share_id).first()
        if share:
            db.delete(share)
            db.commit()
            return {"success": True, "message": "Share deleted successfully"}
        return {"success": False, "message": "Share not found"}
    except Exception as exc:
        db.rollback()
        raise self.retry(exc=exc, countdown=60)
    finally:
        db.close()


@celery_app.task(bind=True, max_retries=3)
def delete_bucket_task(self, bucket_name: str, storage_config_id: Optional[int], user_id: int):
    """
    Background task to delete a bucket and all its contents.
    """
    task_id = self.request.id
    
    try:
        # Update status to running
        TaskProgressStore.update(
            task_id=task_id,
            status=TaskStatus.RUNNING,
            current_step="Initializing bucket deletion"
        )
        
        from app.s3_client import get_s3_client
        
        # Get S3 client
        s3_client = get_s3_client(storage_config_id)
        
        # List and delete all objects in the bucket
        TaskProgressStore.update(
            task_id=task_id,
            current_step=f"Listing objects in bucket '{bucket_name}'",
            progress=10
        )
        
        paginator = s3_client.get_paginator('list_objects_v2')
        objects_to_delete = []
        
        for page in paginator.paginate(Bucket=bucket_name):
            if 'Contents' in page:
                for obj in page['Contents']:
                    objects_to_delete.append({'Key': obj['Key']})
            
            # Process in batches of 1000 (S3 limit)
            while len(objects_to_delete) >= 1000:
                batch = objects_to_delete[:1000]
                s3_client.delete_objects(
                    Bucket=bucket_name,
                    Delete={'Objects': batch}
                )
                objects_to_delete = objects_to_delete[1000:]
        
        # Delete remaining objects
        if objects_to_delete:
            s3_client.delete_objects(
                Bucket=bucket_name,
                Delete={'Objects': objects_to_delete}
            )
        
        TaskProgressStore.update(
            task_id=task_id,
            current_step=f"Deleting bucket '{bucket_name}'",
            progress=80
        )
        
        # Delete the bucket itself
        s3_client.delete_bucket(Bucket=bucket_name)
        
        # Mark as completed
        TaskProgressStore.set_completed(
            task_id=task_id,
            result={
                "bucket_name": bucket_name,
                "deleted": True
            }
        )
        
        return {
            "success": True,
            "bucket_name": bucket_name,
            "message": f"Bucket '{bucket_name}' deleted successfully"
        }
        
    except Exception as exc:
        error_info = {
            "message": str(exc),
            "type": type(exc).__name__
        }
        TaskProgressStore.set_failed(task_id=task_id, error=error_info)
        raise self.retry(exc=exc, countdown=60)


@celery_app.task(bind=True, max_retries=3)
def bulk_delete_task(self, bucket_name: str, keys: list, storage_config_id: Optional[int]):
    """
    Background task to delete multiple objects from a bucket.
    """
    task_id = self.request.id
    total_keys = len(keys)
    
    try:
        # Update status to running
        TaskProgressStore.update(
            task_id=task_id,
            status=TaskStatus.RUNNING,
            current_step=f"Starting bulk delete of {total_keys} objects",
            progress=0
        )
        
        from app.s3_client import get_s3_client
        
        # Get S3 client
        s3_client = get_s3_client(storage_config_id)
        
        deleted_count = 0
        errors = []
        
        # Process in batches of 1000 (S3 limit for delete_objects)
        for i in range(0, total_keys, 1000):
            batch = keys[i:i + 1000]
            objects_to_delete = [{'Key': key} for key in batch]
            
            try:
                response = s3_client.delete_objects(
                    Bucket=bucket_name,
                    Delete={'Objects': objects_to_delete}
                )
                
                # Track deleted count
                if 'Deleted' in response:
                    deleted_count += len(response['Deleted'])
                
                # Track errors
                if 'Errors' in response:
                    errors.extend(response['Errors'])
                
                # Update progress
                progress = min(95, int((deleted_count / total_keys) * 100))
                TaskProgressStore.update(
                    task_id=task_id,
                    progress=progress,
                    current_step=f"Deleted {deleted_count} of {total_keys} objects"
                )
                
            except Exception as e:
                errors.append({"Key": batch[0] if batch else "unknown", "Message": str(e)})
        
        # Mark as completed
        result = {
            "bucket_name": bucket_name,
            "deleted_count": deleted_count,
            "total_keys": total_keys,
            "errors": errors if errors else None
        }
        
        TaskProgressStore.set_completed(task_id=task_id, result=result)
        
        return {
            "success": True,
            "deleted_count": deleted_count,
            "errors": errors
        }
        
    except Exception as exc:
        error_info = {
            "message": str(exc),
            "type": type(exc).__name__
        }
        TaskProgressStore.set_failed(task_id=task_id, error=error_info)
        raise self.retry(exc=exc, countdown=60)


@celery_app.task(bind=True, max_retries=3)
def calculate_size_task(self, bucket_name: str, prefix: str, storage_config_id: Optional[int]):
    """
    Background task to calculate the total size of objects in a bucket or folder.
    """
    task_id = self.request.id
    
    try:
        # Update status to running
        TaskProgressStore.update(
            task_id=task_id,
            status=TaskStatus.RUNNING,
            current_step=f"Calculating size for '{prefix or 'entire bucket'}'",
            progress=0
        )
        
        from app.s3_client import get_s3_client
        
        # Get S3 client
        s3_client = get_s3_client(storage_config_id)
        
        total_size = 0
        object_count = 0
        
        # Use paginator to list all objects with prefix
        paginator = s3_client.get_paginator('list_objects_v2')
        
        list_params = {'Bucket': bucket_name}
        if prefix:
            list_params['Prefix'] = prefix
        
        for page in paginator.paginate(**list_params):
            if 'Contents' in page:
                for obj in page['Contents']:
                    total_size += obj.get('Size', 0)
                    object_count += 1
            
            # Update progress periodically
            progress = min(90, int((object_count / max(object_count, 100)) * 100))
            TaskProgressStore.update(
                task_id=task_id,
                progress=progress,
                current_step=f"Processed {object_count} objects"
            )
        
        # Format size for human readability
        def format_size(size_bytes):
            for unit in ['B', 'KB', 'MB', 'GB', 'TB']:
                if size_bytes < 1024:
                    return f"{size_bytes:.2f} {unit}"
                size_bytes /= 1024
            return f"{size_bytes:.2f} PB"
        
        result = {
            "bucket_name": bucket_name,
            "prefix": prefix,
            "total_size_bytes": total_size,
            "total_size_formatted": format_size(total_size),
            "object_count": object_count
        }
        
        TaskProgressStore.set_completed(task_id=task_id, result=result)
        
        return {
            "success": True,
            "size_bytes": total_size,
            "object_count": object_count
        }
        
    except Exception as exc:
        error_info = {
            "message": str(exc),
            "type": type(exc).__name__
        }
        TaskProgressStore.set_failed(task_id=task_id, error=error_info)
        raise self.retry(exc=exc, countdown=60)
