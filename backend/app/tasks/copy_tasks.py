"""Background tasks for cross-bucket copy/move operations."""

from celery import shared_task
from celery.exceptions import SoftTimeLimitExceeded
from typing import List, Dict, Tuple, Optional
import logging

from .base import ProgressTask
from .progress import TaskProgressStore
from ..s3_client import get_s3_manager_cached, S3Manager
from ..database import SessionLocal
from ..models import SharedLink

logger = logging.getLogger(__name__)


def get_s3_client(storage_config_id: int = None):
    """Get S3 client for tasks (uses cached manager)."""
    return get_s3_manager_cached(storage_config_id=storage_config_id)


def _list_all_objects(
    s3: S3Manager,
    bucket: str,
    prefix: str = ""
) -> List[Dict]:
    """List all objects with given prefix, expanding folders recursively."""
    all_objects = []
    client = s3._get_client()
    paginator = client.get_paginator('list_objects_v2')
    
    for page in paginator.paginate(Bucket=bucket, Prefix=prefix):
        if 'Contents' in page:
            all_objects.extend(page['Contents'])
    
    return all_objects


def _server_side_copy(
    s3: S3Manager,
    source_bucket: str,
    source_keys: List[str],
    dest_bucket: str,
    dest_prefix: str,
    task: ProgressTask,
    overwrite: bool = False
) -> Tuple[List[str], List[Dict[str, str]]]:
    """
    Copy objects using S3 server-side CopyObject API.
    Used when source and destination are in the same storage config.
    """
    copied = []
    failed = []
    
    # First, expand all source keys (handle folders)
    all_objects = []  # List of (source_key, dest_key) tuples
    
    for source_key in source_keys:
        if source_key.endswith('/'):
            # It's a folder - list all objects inside
            objects = _list_all_objects(s3, source_bucket, source_key)
            for obj in objects:
                obj_key = obj['Key']
                # Calculate destination key: preserve folder structure under dest_prefix
                relative_path = obj_key[len(source_key.rstrip('/')) + 1:]
                if dest_prefix:
                    dest_key = dest_prefix.rstrip('/') + '/' + relative_path
                else:
                    dest_key = relative_path
                all_objects.append((obj_key, dest_key, obj.get('Size', 0)))
        else:
            # Single file
            filename = source_key.split('/')[-1]
            if dest_prefix:
                dest_key = dest_prefix.rstrip('/') + '/' + filename
            else:
                dest_key = filename
            # Get size for progress tracking
            try:
                metadata, _ = s3.get_object_metadata(source_bucket, source_key)
                size = metadata.get('size', 0)
            except:
                size = 0
            all_objects.append((source_key, dest_key, size))
    
    total = len(all_objects)
    if total == 0:
        return copied, failed
    
    # Check for conflicts (file exists in destination)
    if not overwrite:
        client = s3._get_client()
        objects_to_copy = []
        for source_key, dest_key, size in all_objects:
            try:
                client.head_object(Bucket=dest_bucket, Key=dest_key)
                # File exists, skip
                failed.append({
                    'source': source_key,
                    'dest': dest_key,
                    'error': 'File already exists (use overwrite to replace)'
                })
            except:
                # File doesn't exist, can copy
                objects_to_copy.append((source_key, dest_key, size))
        all_objects = objects_to_copy
    
    # Copy objects with progress updates
    for i, (source_key, dest_key, size) in enumerate(all_objects):
        if task.is_cancelled():
            logger.info(f"Task {task.request.id} cancelled")
            return copied, failed
        
        progress = int((i / total) * 90)  # Reserve 10% for cleanup
        task.update_progress(progress, f"Copying {source_key}...")
        
        success, error = s3.copy_object(
            source_bucket=source_bucket,
            source_key=source_key,
            dest_bucket=dest_bucket,
            dest_key=dest_key
        )
        
        if success:
            copied.append(dest_key)
            logger.info(f"Copied: {source_key} -> {dest_key}")
        else:
            failed.append({
                'source': source_key,
                'dest': dest_key,
                'error': error
            })
            logger.error(f"Failed to copy {source_key}: {error}")
    
    return copied, failed


def _proxy_copy(
    source_s3: S3Manager,
    dest_s3: S3Manager,
    source_bucket: str,
    source_keys: List[str],
    dest_bucket: str,
    dest_prefix: str,
    task: ProgressTask,
    overwrite: bool = False
) -> Tuple[List[str], List[Dict[str, str]]]:
    """
    Copy objects by streaming through the backend.
    Used when source and destination are in different storage configs.
    """
    copied = []
    failed = []
    
    # Expand all source keys
    all_objects = []  # List of (source_key, dest_key, size) tuples
    
    for source_key in source_keys:
        if source_key.endswith('/'):
            # Folder - list all objects
            objects = _list_all_objects(source_s3, source_bucket, source_key)
            for obj in objects:
                obj_key = obj['Key']
                relative_path = obj_key[len(source_key.rstrip('/')) + 1:]
                if dest_prefix:
                    dest_key = dest_prefix.rstrip('/') + '/' + relative_path
                else:
                    dest_key = relative_path
                all_objects.append((obj_key, dest_key, obj.get('Size', 0)))
        else:
            filename = source_key.split('/')[-1]
            if dest_prefix:
                dest_key = dest_prefix.rstrip('/') + '/' + filename
            else:
                dest_key = filename
            try:
                metadata, _ = source_s3.get_object_metadata(source_bucket, source_key)
                size = metadata.get('size', 0)
            except:
                size = 0
            all_objects.append((source_key, dest_key, size))
    
    total = len(all_objects)
    if total == 0:
        return copied, failed
    
    source_client = source_s3._get_client()
    dest_client = dest_s3._get_client()
    
    # Check for conflicts
    if not overwrite:
        objects_to_copy = []
        for source_key, dest_key, size in all_objects:
            try:
                dest_client.head_object(Bucket=dest_bucket, Key=dest_key)
                failed.append({
                    'source': source_key,
                    'dest': dest_key,
                    'error': 'File already exists (use overwrite to replace)'
                })
            except:
                objects_to_copy.append((source_key, dest_key, size))
        all_objects = objects_to_copy
    
    # Copy each object by streaming
    for i, (source_key, dest_key, size) in enumerate(all_objects):
        if task.is_cancelled():
            return copied, failed
        
        progress = int((i / total) * 90)
        task.update_progress(progress, f"Copying {source_key} ({i+1}/{total})...")
        
        try:
            # For large files (>100MB), use multipart
            if size > 100 * 1024 * 1024:
                success = _multipart_cross_copy(
                    source_client, dest_client,
                    source_bucket, source_key,
                    dest_bucket, dest_key,
                    size, task
                )
            else:
                # Simple streaming copy
                response = source_client.get_object(Bucket=source_bucket, Key=source_key)
                content_type = response.get('ContentType', 'application/octet-stream')
                metadata = response.get('Metadata', {})
                
                dest_client.upload_fileobj(
                    Fileobj=response['Body'],
                    Bucket=dest_bucket,
                    Key=dest_key,
                    ExtraArgs={
                        'ContentType': content_type,
                        'Metadata': metadata
                    }
                )
                success = True
            
            if success:
                copied.append(dest_key)
                logger.info(f"Copied (proxy): {source_key} -> {dest_key}")
            else:
                failed.append({
                    'source': source_key,
                    'dest': dest_key,
                    'error': 'Multipart copy failed'
                })
                
        except Exception as e:
            failed.append({
                'source': source_key,
                'dest': dest_key,
                'error': str(e)
            })
            logger.error(f"Failed to copy {source_key}: {e}")
    
    return copied, failed


def _multipart_cross_copy(
    source_client,
    dest_client,
    source_bucket: str,
    source_key: str,
    dest_bucket: str,
    dest_key: str,
    size: int,
    task: ProgressTask
) -> bool:
    """
    Copy a large file using multipart upload for cross-storage copy.
    Streams parts from source to destination.
    """
    try:
        # Get object metadata
        head_response = source_client.head_object(Bucket=source_bucket, Key=source_key)
        content_type = head_response.get('ContentType', 'application/octet-stream')
        
        # Initiate multipart upload
        mpu_response = dest_client.create_multipart_upload(
            Bucket=dest_bucket,
            Key=dest_key,
            ContentType=content_type
        )
        upload_id = mpu_response['UploadId']
        
        # Download and upload in parts
        part_size = 10 * 1024 * 1024  # 10MB parts
        parts = []
        part_number = 1
        
        response = source_client.get_object(Bucket=source_bucket, Key=source_key)
        body = response['Body']
        
        try:
            while True:
                chunk = body.read(part_size)
                if not chunk:
                    break
                
                # Upload part
                part_response = dest_client.upload_part(
                    Bucket=dest_bucket,
                    Key=dest_key,
                    UploadId=upload_id,
                    PartNumber=part_number,
                    Body=chunk
                )
                
                parts.append({
                    'PartNumber': part_number,
                    'ETag': part_response['ETag']
                })
                part_number += 1
            
            # Complete multipart upload
            dest_client.complete_multipart_upload(
                Bucket=dest_bucket,
                Key=dest_key,
                UploadId=upload_id,
                MultipartUpload={'Parts': parts}
            )
            return True
            
        except Exception as e:
            # Abort on failure
            dest_client.abort_multipart_upload(
                Bucket=dest_bucket,
                Key=dest_key,
                UploadId=upload_id
            )
            raise e
            
    except Exception as e:
        logger.error(f"Multipart copy failed for {source_key}: {e}")
        return False


@shared_task(bind=True, base=ProgressTask, max_retries=3)
def copy_objects_task(
    self,
    source_storage_config_id: int,
    source_bucket: str,
    source_keys: List[str],
    dest_storage_config_id: int,
    dest_bucket: str,
    dest_prefix: str,
    operation: str,
    overwrite: bool = False,
    user_id: int = None
):
    """
    Background task for copying/moving objects between buckets.
    
    Args:
        source_storage_config_id: Source storage config ID
        source_bucket: Source bucket name
        source_keys: List of object keys to copy/move
        dest_storage_config_id: Destination storage config ID
        dest_bucket: Destination bucket name
        dest_prefix: Optional prefix for destination keys
        operation: "copy" or "move"
        overwrite: Whether to overwrite existing files
        user_id: ID of user who initiated the operation
    """
    task_id = self.request.id
    logger.info(
        f"Starting copy_objects_task: task_id={task_id}, "
        f"operation={operation}, source={source_bucket}, dest={dest_bucket}"
    )
    
    try:
        # Create progress entry immediately so polling doesn't 404
        TaskProgressStore.create(
            task_id=task_id,
            task_type="BACKGROUND",
            metadata={
                "operation": operation,
                "source_bucket": source_bucket,
                "dest_bucket": dest_bucket,
                "source_keys_count": len(source_keys)
            }
        )
        
        # Determine copy mode
        same_config = source_storage_config_id == dest_storage_config_id
        
        # Get S3 clients
        source_s3 = get_s3_client(source_storage_config_id)
        if same_config:
            dest_s3 = source_s3
        else:
            dest_s3 = get_s3_client(dest_storage_config_id)
        
        # Perform copy
        self.update_progress(5, "Starting copy operation...")
        
        if same_config:
            copied, failed = _server_side_copy(
                source_s3, source_bucket, source_keys,
                dest_bucket, dest_prefix, self, overwrite
            )
        else:
            copied, failed = _proxy_copy(
                source_s3, dest_s3,
                source_bucket, source_keys,
                dest_bucket, dest_prefix, self, overwrite
            )
        
        # If move operation, delete from source after successful copy
        if operation == "move" and copied:
            self.update_progress(92, "Deleting from source...")
            
            # For move, we need to delete only the successfully copied objects
            # Re-expand source keys to get all objects that were copied
            objects_to_delete = []
            for source_key in source_keys:
                if source_key.endswith('/'):
                    objects = _list_all_objects(source_s3, source_bucket, source_key)
                    for obj in objects:
                        # Only delete if it was in the copied list
                        obj_key = obj['Key']
                        relative_path = obj_key[len(source_key.rstrip('/')) + 1:]
                        if dest_prefix:
                            dest_key = dest_prefix.rstrip('/') + '/' + relative_path
                        else:
                            dest_key = relative_path
                        if dest_key in copied:
                            objects_to_delete.append(obj_key)
                else:
                    filename = source_key.split('/')[-1]
                    if dest_prefix:
                        dest_key = dest_prefix.rstrip('/') + '/' + filename
                    else:
                        dest_key = filename
                    if dest_key in copied:
                        objects_to_delete.append(source_key)
            
            # Delete in batches
            client = source_s3._get_client()
            batch_size = 1000
            deleted_count = 0
            for i in range(0, len(objects_to_delete), batch_size):
                batch = objects_to_delete[i:i+batch_size]
                delete_keys = {'Objects': [{'Key': k} for k in batch]}
                response = client.delete_objects(
                    Bucket=source_bucket,
                    Delete=delete_keys
                )
                deleted_count += len(response.get('Deleted', []))
            
            logger.info(f"Deleted {deleted_count} objects from source")
            
            # Update share links if any (update bucket/key references)
            self.update_progress(97, "Updating share links...")
            db = SessionLocal()
            try:
                for source_key in source_keys:
                    # Find share links pointing to this object
                    share_links = db.query(SharedLink).filter(
                        SharedLink.storage_config_id == source_storage_config_id,
                        SharedLink.bucket_name == source_bucket,
                        SharedLink.object_key.like(f"{source_key}%")
                    ).all()
                    
                    for link in share_links:
                        # Update to point to destination
                        if link.object_key.startswith(source_key):
                            relative_path = link.object_key[len(source_key.rstrip('/')) + 1:]
                            if dest_prefix:
                                new_key = dest_prefix.rstrip('/') + '/' + relative_path
                            else:
                                new_key = relative_path
                            
                            link.storage_config_id = dest_storage_config_id
                            link.bucket_name = dest_bucket
                            link.object_key = new_key
                
                db.commit()
            finally:
                db.close()
        
        self.update_progress(100, "Complete")
        
        result = {
            "status": "completed",
            "operation": operation,
            "copied_count": len(copied),
            "failed_count": len(failed),
            "copied": copied,
            "failed": failed
        }
        
        self.set_complete(result)
        logger.info(f"copy_objects_task completed: {len(copied)} copied, {len(failed)} failed")
        return result
        
    except SoftTimeLimitExceeded:
        logger.error(f"Task {task_id} timed out")
        self.set_failed("Task timed out")
        raise
    except Exception as e:
        logger.exception(f"copy_objects_task {task_id} failed: {e}")
        self.set_failed(str(e))
        raise
