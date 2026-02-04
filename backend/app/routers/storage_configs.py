"""
Storage Config Router - Manage S3 storage configurations with hierarchical permissions
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from typing import Optional
from botocore.exceptions import ClientError, NoCredentialsError, EndpointConnectionError

from app.database import get_db
from app.models import StorageConfig, User, UserStoragePermission, UserBucketPermission
from app.schemas import StorageConfigCreate, StorageConfigUpdate, StorageConfigResponse
from app.auth import get_current_admin_user, get_current_active_user
from app.permissions import (
    require_storage_access,
    require_storage_read,
    get_allowed_storage_ids,
    filter_buckets_by_permission
)
from app.s3_client import get_s3_manager_cached, get_s3_manager, invalidate_storage_config_cache, get_s3_manager_from_config

router = APIRouter(prefix="/api/storage-configs", tags=["storage-configs"])


def mask_credential(credential: Optional[str]) -> str:
    """Mask a credential for display purposes."""
    if not credential:
        return ""
    if len(credential) <= 4:
        return "****"
    return credential[:2] + "****" + credential[-2:]


def storage_config_to_response(config: StorageConfig, mask_credentials: bool = True) -> dict:
    """Convert a StorageConfig model to a response dict."""
    return {
        "id": config.id,
        "name": config.name,
        "endpoint_url": config.endpoint_url,
        "region": config.region_name,
        "use_ssl": config.use_ssl,
        "verify_ssl": config.verify_ssl,
        "is_active": config.is_active,
        "access_key": mask_credential(config.aws_access_key_id) if mask_credentials else config.aws_access_key_id,
        "secret_key": mask_credential(config.aws_secret_access_key) if mask_credentials else config.aws_secret_access_key,
        "created_at": config.created_at if hasattr(config, 'created_at') else None,
        "updated_at": config.updated_at if hasattr(config, 'updated_at') else None,
    }


@router.get("")
def list_storage_configs(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    List storage configurations the user can access.
    
    - Admins see all storage configs
    - Non-admins see only configs they have permission to access (not 'none')
    """
    if current_user.is_admin:
        configs = db.query(StorageConfig).all()
    else:
        # Get storage configs the user has access to
        allowed_ids = get_allowed_storage_ids(current_user, db)
        if not allowed_ids:
            return {"configs": []}  # No access to any storage
        
        configs = db.query(StorageConfig).filter(
            StorageConfig.id.in_(allowed_ids),
            StorageConfig.is_active == True
        ).all()
    
    return {"configs": [storage_config_to_response(config, mask_credentials=True) for config in configs]}


@router.post("", response_model=StorageConfigResponse, status_code=status.HTTP_201_CREATED)
def create_storage_config(
    config_data: StorageConfigCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user)
):
    """Create a new storage configuration (admin only)."""
    try:
        # Validate S3 connection first
        s3_manager = get_s3_manager_cached(
            endpoint_url=config_data.endpoint_url,
            aws_access_key_id=config_data.access_key,
            aws_secret_access_key=config_data.secret_key,
            region_name=config_data.region,
            use_ssl=config_data.use_ssl,
            verify=config_data.verify_ssl
        )
        
        connection_ok, error = s3_manager.test_connection()
        if not connection_ok:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"S3 connection failed: {error}"
            )
        
        # Check if name already exists
        existing = db.query(StorageConfig).filter(StorageConfig.name == config_data.name).first()
        if existing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Storage configuration with name '{config_data.name}' already exists"
            )
        
        # Create new storage config
        config = StorageConfig(
            name=config_data.name,
            endpoint_url=config_data.endpoint_url,
            aws_access_key_id=config_data.access_key,
            aws_secret_access_key=config_data.secret_key,
            region_name=config_data.region,
            use_ssl=config_data.use_ssl,
            verify_ssl=config_data.verify_ssl,
            is_active=config_data.is_active if config_data.is_active is not None else True
        )
        db.add(config)
        db.commit()
        db.refresh(config)
        
        return storage_config_to_response(config, mask_credentials=True)
        
    except HTTPException:
        raise
    except Exception:
        # Log the error internally (in production, use proper logging)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An internal error occurred"
        )


@router.get("/{config_id}", response_model=StorageConfigResponse)
def get_storage_config(
    config_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Get a specific storage configuration.
    
    - Admins can view any config
    - Non-admins can only view configs they have access to
    """
    config = db.query(StorageConfig).filter(StorageConfig.id == config_id).first()
    if not config:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Storage configuration not found"
        )
    
    # Check access permission
    require_storage_access(current_user, config_id, db)
    
    # Non-admins only get masked credentials
    mask = not current_user.is_admin
    return storage_config_to_response(config, mask_credentials=mask)


@router.put("/{config_id}", response_model=StorageConfigResponse)
def update_storage_config(
    config_id: int,
    config_data: StorageConfigUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user)
):
    """Update a storage configuration (admin only)."""
    config = db.query(StorageConfig).filter(StorageConfig.id == config_id).first()
    if not config:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Storage configuration not found"
        )
    
    try:
        # Check if name is being changed and if new name already exists
        if config_data.name is not None and config_data.name != config.name:
            existing = db.query(StorageConfig).filter(
                StorageConfig.name == config_data.name,
                StorageConfig.id != config_id
            ).first()
            if existing:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Storage configuration with name '{config_data.name}' already exists"
                )
        
        # Determine if credentials are being changed
        credentials_changed = (
            config_data.endpoint_url is not None or
            config_data.access_key is not None or
            config_data.secret_key is not None or
            config_data.region is not None or
            config_data.use_ssl is not None or
            config_data.verify_ssl is not None
        )
        
        # Build updated values for connection test
        endpoint_url = config_data.endpoint_url if config_data.endpoint_url is not None else config.endpoint_url
        access_key = config_data.access_key if config_data.access_key is not None else config.aws_access_key_id
        secret_key = config_data.secret_key if config_data.secret_key is not None else config.aws_secret_access_key
        region = config_data.region if config_data.region is not None else config.region_name
        use_ssl = config_data.use_ssl if config_data.use_ssl is not None else config.use_ssl
        verify_ssl = config_data.verify_ssl if config_data.verify_ssl is not None else config.verify_ssl
        
        # Test connection if credentials changed
        if credentials_changed:
            # For connection testing with new credentials, don't use cache
            # since we want to test the actual new connection
            s3_manager = get_s3_manager(
                endpoint_url=endpoint_url,
                aws_access_key_id=access_key,
                aws_secret_access_key=secret_key,
                region_name=region,
                use_ssl=use_ssl,
                verify=verify_ssl
            )
            
            connection_ok, error = s3_manager.test_connection()
            if not connection_ok:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"S3 connection failed: {error}"
                )
            
            # Invalidate cache for this config to use new credentials on next request
            invalidate_storage_config_cache(config_id)
        
        # Prevent deactivating the last active config
        if config_data.is_active is not None and not config_data.is_active and config.is_active:
            active_count = db.query(StorageConfig).filter(StorageConfig.is_active == True).count()
            if active_count <= 1:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Cannot deactivate the last active storage configuration"
                )
        
        # Update fields
        if config_data.name is not None:
            config.name = config_data.name
        if config_data.endpoint_url is not None:
            config.endpoint_url = config_data.endpoint_url
        if config_data.access_key is not None:
            config.aws_access_key_id = config_data.access_key
        if config_data.secret_key is not None:
            config.aws_secret_access_key = config_data.secret_key
        if config_data.region is not None:
            config.region_name = config_data.region
        if config_data.use_ssl is not None:
            config.use_ssl = config_data.use_ssl
        if config_data.verify_ssl is not None:
            config.verify_ssl = config_data.verify_ssl
        if config_data.is_active is not None:
            config.is_active = config_data.is_active
        
        db.commit()
        db.refresh(config)
        
        return storage_config_to_response(config, mask_credentials=True)
        
    except HTTPException:
        raise
    except Exception:
        # Log the error internally (in production, use proper logging)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An internal error occurred"
        )


@router.delete("/{config_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_storage_config(
    config_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user)
):
    """Delete a storage configuration (admin only)."""
    config = db.query(StorageConfig).filter(StorageConfig.id == config_id).first()
    if not config:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Storage configuration not found"
        )
    
    # Prevent deleting the last storage config
    config_count = db.query(StorageConfig).count()
    if config_count <= 1:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot delete the last storage configuration"
        )
    
    # Cascade delete related permissions
    db.query(UserStoragePermission).filter(
        UserStoragePermission.storage_config_id == config_id
    ).delete()
    
    db.query(UserBucketPermission).filter(
        UserBucketPermission.storage_config_id == config_id
    ).delete()
    
    # Invalidate cache for this config before deleting
    invalidate_storage_config_cache(config_id)
    
    db.delete(config)
    db.commit()
    
    return None


@router.post("/{config_id}/test")
def test_storage_config_connection(
    config_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user)
):
    """Test S3 connection for a storage configuration (admin only)."""
    config = db.query(StorageConfig).filter(StorageConfig.id == config_id).first()
    if not config:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Storage configuration not found"
        )
    
    try:
        s3_manager = get_s3_manager_from_config(config)
        
        connection_ok, error = s3_manager.test_connection()
        
        if connection_ok:
            return {
                "success": True,
                "message": "Connection successful"
            }
        else:
            return {
                "success": False,
                "message": f"Connection failed: {error}"
            }
            
    except (ClientError, NoCredentialsError, EndpointConnectionError) as e:
        return {
            "success": False,
            "message": f"Connection failed: {str(e)}"
        }


@router.get("/{config_id}/buckets")
def list_storage_config_buckets(
    config_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    List buckets in a storage configuration.
    
    - Admins can see all buckets
    - Non-admins only see buckets they have access to (based on storage + bucket permissions)
    """
    config = db.query(StorageConfig).filter(
        StorageConfig.id == config_id,
        StorageConfig.is_active == True
    ).first()
    
    if not config:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Storage configuration not found or inactive"
        )
    
    # Check storage-level access
    require_storage_read(current_user, config_id, db)
    
    try:
        s3_manager = get_s3_manager_from_config(config)
        
        buckets, error = s3_manager.list_buckets()
        
        if error:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to list buckets: {error}"
            )
        
        # Filter buckets based on user's permissions
        filtered_buckets = filter_buckets_by_permission(
            current_user, buckets, config_id, db
        )
        
        return {"buckets": filtered_buckets}
        
    except HTTPException:
        raise
    except Exception:
        # Log the error internally (in production, use proper logging)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An internal error occurred"
        )


# ========== Permission Management (Admin Only) ==========

@router.get("/{config_id}/users")
def get_storage_config_users(
    config_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user)
):
    """
    Get all users who have access to this storage config with their permission levels.
    (admin only)
    """
    config = db.query(StorageConfig).filter(StorageConfig.id == config_id).first()
    if not config:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Storage configuration not found"
        )
    
    # Get all storage permissions for this config
    storage_perms = db.query(UserStoragePermission, User).join(
        User, UserStoragePermission.user_id == User.id
    ).filter(
        UserStoragePermission.storage_config_id == config_id
    ).all()
    
    # Get all bucket permissions for this config
    bucket_perms = db.query(UserBucketPermission, User).join(
        User, UserBucketPermission.user_id == User.id
    ).filter(
        UserBucketPermission.storage_config_id == config_id
    ).all()
    
    # Group by user
    user_data = {}
    
    for perm, user in storage_perms:
        user_data[user.id] = {
            "user_id": user.id,
            "user_name": user.name,
            "user_email": user.email,
            "storage_permission": perm.permission.value,
            "bucket_permissions": []
        }
    
    for perm, user in bucket_perms:
        if user.id not in user_data:
            user_data[user.id] = {
                "user_id": user.id,
                "user_name": user.name,
                "user_email": user.email,
                "storage_permission": None,
                "bucket_permissions": []
            }
        user_data[user.id]["bucket_permissions"].append({
            "bucket_name": perm.bucket_name,
            "permission": perm.permission.value
        })
    
    return {
        "storage_config_id": config_id,
        "storage_config_name": config.name,
        "users": list(user_data.values())
    }
