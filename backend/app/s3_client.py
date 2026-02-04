import boto3
from botocore.config import Config
from botocore.exceptions import ClientError, NoCredentialsError, EndpointConnectionError
from typing import Optional, List, Dict, Any, Tuple
import mimetypes
from datetime import datetime
import threading
import hashlib
from urllib.parse import urlparse


class S3Manager:
    """Manager class for S3 operations."""
    
    def __init__(
        self,
        endpoint_url: Optional[str] = None,
        aws_access_key_id: Optional[str] = None,
        aws_secret_access_key: Optional[str] = None,
        region_name: str = "us-east-1",
        use_ssl: bool = True,
        verify: bool = True
    ):
        self.endpoint_url = endpoint_url
        self.aws_access_key_id = aws_access_key_id
        self.aws_secret_access_key = aws_secret_access_key
        self.region_name = region_name
        self.use_ssl = use_ssl
        self.verify = verify
        self._client = None
        self._lock = threading.Lock()
    
    def _get_effective_region(self) -> str:
        """Get the effective region to use for S3 operations.
        
        For providers like Hetzner, the region must match the location in the endpoint URL.
        e.g., endpoint: https://hel1.your-objectstorage.com -> region: hel1
        """
        if self.endpoint_url:
            endpoint_location = self._extract_location_from_endpoint()
            if endpoint_location:
                return endpoint_location
        return self.region_name
    
    def _get_client(self):
        """Get or create S3 client (thread-safe)."""
        if self._client is None:
            with self._lock:
                # Double-check pattern to prevent race conditions
                if self._client is None:
                    config = Config(
                        signature_version='s3v4',
                        retries={'max_attempts': 3, 'mode': 'standard'},
                        # Enable connection pooling for better performance
                        max_pool_connections=25
                    )
                    
                    # Use effective region (extracted from endpoint for Hetzner, etc.)
                    effective_region = self._get_effective_region()
                    
                    kwargs = {
                        'region_name': effective_region,
                        'config': config,
                    }
                    
                    if self.endpoint_url:
                        kwargs['endpoint_url'] = self.endpoint_url
                        kwargs['use_ssl'] = self.use_ssl
                        kwargs['verify'] = self.verify
                    
                    if self.aws_access_key_id:
                        kwargs['aws_access_key_id'] = self.aws_access_key_id
                        kwargs['aws_secret_access_key'] = self.aws_secret_access_key
                    
                    self._client = boto3.client('s3', **kwargs)
        
        return self._client
    
    def close(self):
        """Close the S3 client and release resources."""
        with self._lock:
            if self._client is not None:
                try:
                    self._client.close()
                except Exception:
                    pass
                self._client = None
    
    def test_connection(self) -> Tuple[bool, Optional[str]]:
        """Test S3 connection."""
        try:
            client = self._get_client()
            client.list_buckets()
            return True, None
        except (ClientError, NoCredentialsError, EndpointConnectionError) as e:
            return False, str(e)
    
    def list_buckets(self) -> Tuple[List[Dict], Optional[str]]:
        """List all buckets."""
        try:
            client = self._get_client()
            response = client.list_buckets()
            
            buckets = []
            for bucket in response.get('Buckets', []):
                buckets.append({
                    'name': bucket['Name'],
                    'creation_date': bucket['CreationDate']
                })
            
            return buckets, None
        except (ClientError, NoCredentialsError, EndpointConnectionError) as e:
            return [], str(e)
    
    def _extract_location_from_endpoint(self) -> Optional[str]:
        """Extract location from endpoint URL for providers like Hetzner.
        
        Hetzner endpoints are like: https://hel1.your-objectstorage.com
        The location is the first subdomain (hel1, nbg1, fsn1, etc.)
        """
        if not self.endpoint_url:
            return None
        
        try:
            parsed = urlparse(self.endpoint_url)
            hostname = parsed.hostname
            
            if not hostname:
                return None
            
            # For Hetzner: hel1.your-objectstorage.com -> hel1
            parts = hostname.split('.')
            if len(parts) >= 3:
                first_part = parts[0]
                # Check if it looks like a Hetzner location (2-4 letter code followed by number)
                # Examples: hel1, nbg1, fsn1
                if len(first_part) >= 3 and first_part[-1].isdigit():
                    return first_part
            
            return None
        except Exception:
            return None
    
    def create_bucket(self, bucket_name: str) -> Tuple[bool, Optional[str]]:
        """Create a new bucket."""
        try:
            client = self._get_client()
            
            # Determine the LocationConstraint to use
            location_constraint = None
            
            if self.region_name == 'us-east-1':
                # AWS us-east-1 doesn't need LocationConstraint
                location_constraint = None
            else:
                # For other regions, check if endpoint has a location prefix (Hetzner, etc.)
                endpoint_location = self._extract_location_from_endpoint()
                if endpoint_location:
                    # Use the location from endpoint (e.g., hel1, nbg1)
                    location_constraint = endpoint_location
                else:
                    # Use the region name as LocationConstraint (AWS, etc.)
                    location_constraint = self.region_name
            
            if location_constraint:
                client.create_bucket(
                    Bucket=bucket_name,
                    CreateBucketConfiguration={
                        'LocationConstraint': location_constraint
                    }
                )
            else:
                client.create_bucket(Bucket=bucket_name)
            
            return True, None
        except (ClientError, NoCredentialsError, EndpointConnectionError) as e:
            return False, str(e)
    
    def delete_bucket(self, bucket_name: str) -> Tuple[bool, Optional[str]]:
        """Delete a bucket (empties it first)."""
        try:
            client = self._get_client()
            
            # First, delete all objects
            paginator = client.get_paginator('list_objects_v2')
            for page in paginator.paginate(Bucket=bucket_name):
                objects = page.get('Contents', [])
                if objects:
                    delete_keys = {'Objects': [{'Key': obj['Key']} for obj in objects]}
                    client.delete_objects(Bucket=bucket_name, Delete=delete_keys)
            
            # Delete the bucket
            client.delete_bucket(Bucket=bucket_name)
            return True, None
        except (ClientError, NoCredentialsError, EndpointConnectionError) as e:
            return False, str(e)
    
    def list_objects(
        self,
        bucket_name: str,
        prefix: str = "",
        delimiter: str = "/",
        max_keys: int = 100,
        continuation_token: Optional[str] = None
    ) -> Tuple[Dict, Optional[str]]:
        """List objects in a bucket."""
        try:
            client = self._get_client()
            
            kwargs = {
                'Bucket': bucket_name,
                'Prefix': prefix,
                'MaxKeys': max_keys,
            }
            
            if delimiter:
                kwargs['Delimiter'] = delimiter
            
            if continuation_token:
                kwargs['ContinuationToken'] = continuation_token
            
            response = client.list_objects_v2(**kwargs)
            
            # Process common prefixes (directories)
            directories = []
            for cp in response.get('CommonPrefixes', []):
                prefix_path = cp.get('Prefix', '')
                name = prefix_path.rstrip('/').split('/')[-1] if '/' in prefix_path else prefix_path
                directories.append({
                    'name': name,
                    'prefix': prefix_path,
                    'type': 'directory'
                })
            
            # Process objects (files)
            objects = []
            for obj in response.get('Contents', []):
                key = obj['Key']
                if key == prefix or key.endswith('/'):
                    continue
                
                name = key.split('/')[-1] if '/' in key else key
                content_type, _ = mimetypes.guess_type(name)
                if not content_type:
                    content_type = 'application/octet-stream'
                
                objects.append({
                    'name': name,
                    'key': key,
                    'size': obj['Size'],
                    'size_formatted': self._format_size(obj['Size']),
                    'last_modified': obj['LastModified'],
                    'etag': obj['ETag'].strip('"'),
                    'type': 'file',
                    'content_type': content_type
                })
            
            result = {
                'directories': directories,
                'objects': objects,
                'prefix': prefix,
                'is_truncated': response.get('IsTruncated', False)
            }
            
            if response.get('IsTruncated'):
                result['next_continuation_token'] = response.get('NextContinuationToken')
            
            return result, None
        
        except (ClientError, NoCredentialsError, EndpointConnectionError) as e:
            return {}, str(e)
    
    def get_object_metadata(self, bucket_name: str, key: str) -> Tuple[Dict, Optional[str]]:
        """Get object metadata."""
        try:
            client = self._get_client()
            response = client.head_object(Bucket=bucket_name, Key=key)
            
            return {
                'key': key,
                'size': response.get('ContentLength', 0),
                'size_formatted': self._format_size(response.get('ContentLength', 0)),
                'content_type': response.get('ContentType', 'application/octet-stream'),
                'last_modified': response.get('LastModified', datetime.now()),
                'etag': response.get('ETag', '').strip('"'),
                'metadata': response.get('Metadata', {})
            }, None
        except (ClientError, NoCredentialsError, EndpointConnectionError) as e:
            return {}, str(e)
    
    def upload_object(
        self,
        bucket_name: str,
        key: str,
        file_content,
        content_type: Optional[str] = None
    ) -> Tuple[bool, Optional[str]]:
        """Upload an object."""
        try:
            client = self._get_client()
            
            if not content_type:
                content_type, _ = mimetypes.guess_type(key)
                if not content_type:
                    content_type = 'application/octet-stream'
            
            client.upload_fileobj(
                file_content,
                bucket_name,
                key,
                ExtraArgs={'ContentType': content_type}
            )
            
            return True, None
        except (ClientError, NoCredentialsError, EndpointConnectionError) as e:
            return False, str(e)
    
    def download_object(self, bucket_name: str, key: str):
        """Get object for download."""
        try:
            client = self._get_client()
            response = client.get_object(Bucket=bucket_name, Key=key)
            return response, None
        except (ClientError, NoCredentialsError, EndpointConnectionError) as e:
            return None, str(e)
    
    def delete_object(self, bucket_name: str, key: str) -> Tuple[bool, Optional[str]]:
        """Delete an object."""
        try:
            client = self._get_client()
            client.delete_object(Bucket=bucket_name, Key=key)
            return True, None
        except (ClientError, NoCredentialsError, EndpointConnectionError) as e:
            return False, str(e)
    
    def delete_objects(self, bucket_name: str, keys: List[str]) -> Tuple[List[str], Optional[str]]:
        """Delete multiple objects."""
        try:
            client = self._get_client()
            delete_keys = {'Objects': [{'Key': key} for key in keys]}
            response = client.delete_objects(Bucket=bucket_name, Delete=delete_keys)
            
            deleted = [obj['Key'] for obj in response.get('Deleted', [])]
            return deleted, None
        except (ClientError, NoCredentialsError, EndpointConnectionError) as e:
            return [], str(e)
    
    def create_prefix(self, bucket_name: str, prefix: str) -> Tuple[bool, Optional[str]]:
        """Create a folder/prefix."""
        try:
            client = self._get_client()
            
            if not prefix.endswith('/'):
                prefix += '/'
            
            client.put_object(Bucket=bucket_name, Key=prefix, Body='')
            return True, None
        except (ClientError, NoCredentialsError, EndpointConnectionError) as e:
            return False, str(e)
    
    def delete_prefix(self, bucket_name: str, prefix: str) -> Tuple[int, Optional[str]]:
        """Delete a prefix and all its contents. Returns count of deleted objects."""
        try:
            client = self._get_client()
            
            if not prefix.endswith('/'):
                prefix += '/'
            
            # List all objects with this prefix
            paginator = client.get_paginator('list_objects_v2')
            all_keys = []
            
            for page in paginator.paginate(Bucket=bucket_name, Prefix=prefix):
                objects = page.get('Contents', [])
                all_keys.extend([obj['Key'] for obj in objects])
            
            if not all_keys:
                return 0, None
            
            # Delete all objects in batches of 1000
            deleted_count = 0
            for i in range(0, len(all_keys), 1000):
                batch = all_keys[i:i+1000]
                delete_keys = {'Objects': [{'Key': key} for key in batch]}
                response = client.delete_objects(Bucket=bucket_name, Delete=delete_keys)
                deleted_count += len(response.get('Deleted', []))
            
            return deleted_count, None
        except (ClientError, NoCredentialsError, EndpointConnectionError) as e:
            return 0, str(e)
    
    def calculate_size(self, bucket_name: str, prefix: str = "") -> Tuple[int, Optional[str]]:
        """Calculate total size of a bucket or prefix."""
        try:
            client = self._get_client()
            
            paginator = client.get_paginator('list_objects_v2')
            total_size = 0
            
            for page in paginator.paginate(Bucket=bucket_name, Prefix=prefix):
                for obj in page.get('Contents', []):
                    total_size += obj['Size']
            
            return total_size, None
        except (ClientError, NoCredentialsError, EndpointConnectionError) as e:
            return 0, str(e)
    
    @staticmethod
    def _format_size(size_bytes: int) -> str:
        """Format byte size to human readable string."""
        if size_bytes == 0:
            return '0 B'
        
        units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB']
        unit_index = 0
        size = float(size_bytes)
        
        while size >= 1024 and unit_index < len(units) - 1:
            size /= 1024
            unit_index += 1
        
        return f'{size:.2f} {units[unit_index]}'


# ============================================================================
# S3 Client Cache Implementation
# ============================================================================

# Module-level cache for S3Manager instances
# Key: storage_config_id (int) or config hash string
# Value: S3Manager instance
_s3_clients: Dict[str, S3Manager] = {}
_cache_lock = threading.Lock()


def _generate_cache_key(
    endpoint_url: Optional[str] = None,
    aws_access_key_id: Optional[str] = None,
    aws_secret_access_key: Optional[str] = None,
    region_name: str = "us-east-1",
    use_ssl: bool = True,
    verify: bool = True
) -> str:
    """Generate a unique cache key from connection parameters.
    
    The key includes all connection parameters to ensure clients with different
    credentials are cached separately for security.
    """
    # Create a deterministic string from all parameters
    key_parts = [
        str(endpoint_url) if endpoint_url else "",
        str(aws_access_key_id) if aws_access_key_id else "",
        str(aws_secret_access_key) if aws_secret_access_key else "",
        region_name,
        str(use_ssl),
        str(verify)
    ]
    key_string = "|".join(key_parts)
    
    # Use hash for shorter, consistent keys
    return hashlib.sha256(key_string.encode()).hexdigest()[:32]


def get_s3_manager(
    endpoint_url: Optional[str] = None,
    aws_access_key_id: Optional[str] = None,
    aws_secret_access_key: Optional[str] = None,
    region_name: str = "us-east-1",
    use_ssl: bool = True,
    verify: bool = True
) -> S3Manager:
    """Factory function to create S3Manager (creates a new instance each time).
    
    Note: For better performance, consider using get_s3_manager_cached() which
    reuses S3Manager instances and their underlying boto3 connections.
    """
    return S3Manager(
        endpoint_url=endpoint_url,
        aws_access_key_id=aws_access_key_id,
        aws_secret_access_key=aws_secret_access_key,
        region_name=region_name,
        use_ssl=use_ssl,
        verify=verify
    )


def get_s3_manager_cached(
    storage_config_id: Optional[int] = None,
    endpoint_url: Optional[str] = None,
    aws_access_key_id: Optional[str] = None,
    aws_secret_access_key: Optional[str] = None,
    region_name: str = "us-east-1",
    use_ssl: bool = True,
    verify: bool = True
) -> S3Manager:
    """Get a cached S3Manager instance for the given configuration.
    
    This function reuses S3Manager instances and their underlying boto3 connections,
    providing significant performance improvements over creating new clients for each request.
    
    Args:
        storage_config_id: Optional database ID for the storage config (used as primary cache key)
        endpoint_url: S3 endpoint URL
        aws_access_key_id: AWS access key
        aws_secret_access_key: AWS secret key
        region_name: AWS region
        use_ssl: Whether to use SSL
        verify: Whether to verify SSL certificates
    
    Returns:
        S3Manager instance (cached or newly created)
    """
    # Use storage_config_id as primary cache key if provided
    if storage_config_id is not None:
        cache_key = f"config_{storage_config_id}"
        
        # Load storage config from database if credentials not provided
        if endpoint_url is None or aws_access_key_id is None:
            from app.database import SessionLocal
            from app.models import StorageConfig
            
            db = SessionLocal()
            try:
                config = db.query(StorageConfig).filter(StorageConfig.id == storage_config_id).first()
                if config:
                    endpoint_url = config.endpoint_url
                    aws_access_key_id = config.aws_access_key_id
                    aws_secret_access_key = config.aws_secret_access_key
                    region_name = config.region_name or region_name
                    use_ssl = config.use_ssl if config.use_ssl is not None else use_ssl
                    verify = config.verify_ssl if config.verify_ssl is not None else verify
                else:
                    raise ValueError(f"Storage config with ID {storage_config_id} not found")
            finally:
                db.close()
    else:
        # Generate key from connection parameters
        cache_key = _generate_cache_key(
            endpoint_url=endpoint_url,
            aws_access_key_id=aws_access_key_id,
            aws_secret_access_key=aws_secret_access_key,
            region_name=region_name,
            use_ssl=use_ssl,
            verify=verify
        )
    
    with _cache_lock:
        if cache_key not in _s3_clients:
            _s3_clients[cache_key] = S3Manager(
                endpoint_url=endpoint_url,
                aws_access_key_id=aws_access_key_id,
                aws_secret_access_key=aws_secret_access_key,
                region_name=region_name,
                use_ssl=use_ssl,
                verify=verify
            )
        
        return _s3_clients[cache_key]


def clear_s3_client_cache(config_id: Optional[int] = None) -> int:
    """Clear the S3 client cache.
    
    Args:
        config_id: If provided, only clear cache for this specific storage config.
                  If None, clear entire cache.
    
    Returns:
        Number of cached clients removed
    """
    with _cache_lock:
        if config_id is not None:
            cache_key = f"config_{config_id}"
            if cache_key in _s3_clients:
                # Close the client to release resources
                _s3_clients[cache_key].close()
                del _s3_clients[cache_key]
                return 1
            return 0
        else:
            count = len(_s3_clients)
            # Close all clients
            for manager in _s3_clients.values():
                manager.close()
            _s3_clients.clear()
            return count


def get_cache_stats() -> Dict[str, Any]:
    """Get statistics about the S3 client cache.
    
    Returns:
        Dict with cache size and other stats
    """
    with _cache_lock:
        return {
            "cached_clients": len(_s3_clients),
            "cache_keys": list(_s3_clients.keys())
        }


def invalidate_storage_config_cache(config_id: int) -> bool:
    """Invalidate cache for a specific storage configuration.
    
    This should be called when a storage configuration is updated or deleted.
    
    Args:
        config_id: The storage config ID to invalidate
    
    Returns:
        True if a cached client was removed, False otherwise
    """
    return clear_s3_client_cache(config_id) > 0


def get_s3_manager_from_config(config, storage_config_id: int = None):
    """Create S3 manager from StorageConfig model.
    
    Args:
        config: StorageConfig model instance
        storage_config_id: Optional storage config ID override (defaults to config.id)
    
    Returns:
        S3Manager instance (cached)
    """
    return get_s3_manager_cached(
        storage_config_id=storage_config_id or config.id,
        endpoint_url=config.endpoint_url,
        aws_access_key_id=config.aws_access_key_id,
        aws_secret_access_key=config.aws_secret_access_key,
        region_name=config.region_name,
        use_ssl=config.use_ssl,
        verify=config.verify_ssl
    )
