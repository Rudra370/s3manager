"""
User Management Router - Admin only endpoints for managing users and permissions
"""

from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from sqlalchemy import and_
from typing import List, Optional

from app.database import get_db
from app.models import (
    User, 
    StorageConfig,
    UserStoragePermission,
    UserBucketPermission
)
from app.schemas import (
    UserCreate, UserUpdate, UserResponse, UserListResponse,
    UserStoragePermissionCreate, UserStoragePermissionResponse,
    UserBucketPermissionCreate, UserBucketPermissionResponse
)
from app.auth import get_password_hash, get_current_admin_user

router = APIRouter(prefix="/api/users", tags=["users"])


# ========== User CRUD Operations ==========

@router.get("", response_model=UserListResponse)
def list_users(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user)
):
    """List all users with their permissions (admin only)."""
    users = db.query(User).all()
    
    user_responses = []
    for user in users:
        # Get storage permissions with config names
        storage_perms = db.query(
            UserStoragePermission,
            StorageConfig.name.label('config_name')
        ).join(
            StorageConfig,
            UserStoragePermission.storage_config_id == StorageConfig.id
        ).filter(
            UserStoragePermission.user_id == user.id
        ).all()
        
        # Get bucket permissions with config names
        bucket_perms = db.query(
            UserBucketPermission,
            StorageConfig.name.label('config_name')
        ).join(
            StorageConfig,
            UserBucketPermission.storage_config_id == StorageConfig.id
        ).filter(
            UserBucketPermission.user_id == user.id
        ).all()
        
        user_responses.append({
            "id": user.id,
            "name": user.name,
            "email": user.email,
            "is_admin": user.is_admin,
            "is_active": user.is_active,
            "created_at": user.created_at,
            "storage_permissions": [
                {
                    "id": p.UserStoragePermission.id,
                    "user_id": p.UserStoragePermission.user_id,
                    "storage_config_id": p.UserStoragePermission.storage_config_id,
                    "storage_config_name": p.config_name,
                    "permission": p.UserStoragePermission.permission.value if hasattr(p.UserStoragePermission.permission, 'value') else p.UserStoragePermission.permission,
                    "created_at": p.UserStoragePermission.created_at,
                    "updated_at": p.UserStoragePermission.updated_at
                }
                for p in storage_perms
            ],
            "bucket_permissions": [
                {
                    "id": p.UserBucketPermission.id,
                    "user_id": p.UserBucketPermission.user_id,
                    "storage_config_id": p.UserBucketPermission.storage_config_id,
                    "storage_config_name": p.config_name,
                    "bucket_name": p.UserBucketPermission.bucket_name,
                    "permission": p.UserBucketPermission.permission.value if hasattr(p.UserBucketPermission.permission, 'value') else p.UserBucketPermission.permission,
                    "created_at": p.UserBucketPermission.created_at,
                    "updated_at": p.UserBucketPermission.updated_at
                }
                for p in bucket_perms
            ]
        })
    
    return {"users": user_responses}


@router.post("", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
def create_user(
    user_data: UserCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user)
):
    """Create a new user with optional permissions (admin only)."""
    # Check if email already exists
    existing_user = db.query(User).filter(User.email == user_data.email).first()
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered"
        )
    
    # Create user
    hashed_password = get_password_hash(user_data.password)
    new_user = User(
        name=user_data.name,
        email=user_data.email,
        hashed_password=hashed_password,
        is_admin=user_data.is_admin,
        is_active=True,
        role='admin' if user_data.is_admin else 'read-only'
    )
    db.add(new_user)
    db.flush()  # Get the user ID
    
    # Add storage permissions if provided (and user is not admin)
    if not new_user.is_admin and user_data.storage_permissions:
        for perm_data in user_data.storage_permissions:
            storage_perm = UserStoragePermission(
                user_id=new_user.id,
                storage_config_id=perm_data.storage_config_id,
                permission=perm_data.permission
            )
            db.add(storage_perm)
    
    # Add bucket permissions if provided (and user is not admin)
    if not new_user.is_admin and user_data.bucket_permissions:
        for perm_data in user_data.bucket_permissions:
            bucket_perm = UserBucketPermission(
                user_id=new_user.id,
                storage_config_id=perm_data.storage_config_id,
                bucket_name=perm_data.bucket_name,
                permission=perm_data.permission
            )
            db.add(bucket_perm)
    
    db.commit()
    db.refresh(new_user)
    
    return _build_user_response(new_user, db)


@router.get("/{user_id}", response_model=UserResponse)
def get_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user)
):
    """Get a specific user by ID (admin only)."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    return _build_user_response(user, db)


@router.put("/{user_id}", response_model=UserResponse)
def update_user(
    user_id: int,
    user_data: UserUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user)
):
    """Update a user including permissions (admin only)."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    # Prevent modifying the last admin
    if user_data.is_admin is False and user.is_admin:
        admin_count = db.query(User).filter(
            User.is_admin == True, 
            User.is_active == True
        ).count()
        if admin_count <= 1:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot remove admin role from the last admin"
            )
    
    # Update basic fields
    if user_data.name is not None:
        user.name = user_data.name
    if user_data.email is not None:
        existing = db.query(User).filter(
            User.email == user_data.email,
            User.id != user_id
        ).first()
        if existing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Email already registered"
            )
        user.email = user_data.email
    if user_data.is_admin is not None:
        user.is_admin = user_data.is_admin
    if user_data.is_active is not None:
        # Prevent deactivating the last admin
        if not user_data.is_active and user.is_admin:
            admin_count = db.query(User).filter(
                User.is_admin == True, 
                User.is_active == True
            ).count()
            if admin_count <= 1:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Cannot deactivate the last admin"
                )
        user.is_active = user_data.is_active
    
    # Update storage permissions if provided (and user is not admin)
    if not user.is_admin and user_data.storage_permissions is not None:
        # Remove existing storage permissions
        db.query(UserStoragePermission).filter(
            UserStoragePermission.user_id == user.id
        ).delete()
        
        # Add new storage permissions
        for perm_data in user_data.storage_permissions:
            storage_perm = UserStoragePermission(
                user_id=user.id,
                storage_config_id=perm_data.storage_config_id,
                permission=perm_data.permission.value
            )
            db.add(storage_perm)
    
    # Update bucket permissions if provided (and user is not admin)
    if not user.is_admin and user_data.bucket_permissions is not None:
        # Remove existing bucket permissions
        db.query(UserBucketPermission).filter(
            UserBucketPermission.user_id == user.id
        ).delete()
        
        # Add new bucket permissions
        for perm_data in user_data.bucket_permissions:
            bucket_perm = UserBucketPermission(
                user_id=user.id,
                storage_config_id=perm_data.storage_config_id,
                bucket_name=perm_data.bucket_name,
                permission=perm_data.permission.value
            )
            db.add(bucket_perm)
    
    db.commit()
    db.refresh(user)
    
    return _build_user_response(user, db)


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user)
):
    """Delete a user (admin only)."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    # Prevent deleting yourself
    if user.id == current_user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot delete your own account"
        )
    
    # Prevent deleting the last admin
    if user.is_admin:
        admin_count = db.query(User).filter(
            User.is_admin == True, 
            User.is_active == True
        ).count()
        if admin_count <= 1:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot delete the last admin"
            )
    
    db.delete(user)  # Cascade will handle permissions
    db.commit()
    
    return None


@router.post("/{user_id}/reset-password")
def reset_user_password(
    user_id: int,
    new_password: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user)
):
    """Reset a user's password (admin only)."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    if len(new_password) < 6:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Password must be at least 6 characters"
        )
    
    user.hashed_password = get_password_hash(new_password)
    db.commit()
    
    return {"success": True, "message": "Password reset successfully"}


# ========== Storage Permission Management ==========

@router.get("/{user_id}/storage-permissions", response_model=List[UserStoragePermissionResponse])
def get_user_storage_permissions(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user)
):
    """Get all storage permissions for a user (admin only)."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    perms = db.query(
        UserStoragePermission,
        StorageConfig.name.label('config_name')
    ).join(
        StorageConfig,
        UserStoragePermission.storage_config_id == StorageConfig.id
    ).filter(
        UserStoragePermission.user_id == user_id
    ).all()
    
    return [
        {
            "id": p.UserStoragePermission.id,
            "user_id": p.UserStoragePermission.user_id,
            "storage_config_id": p.UserStoragePermission.storage_config_id,
            "storage_config_name": p.config_name,
            "permission": p.UserStoragePermission.permission.value if hasattr(p.UserStoragePermission.permission, 'value') else p.UserStoragePermission.permission,
            "created_at": p.UserStoragePermission.created_at,
            "updated_at": p.UserStoragePermission.updated_at
        }
        for p in perms
    ]


@router.post("/{user_id}/storage-permissions", response_model=UserStoragePermissionResponse)
def add_user_storage_permission(
    user_id: int,
    perm_data: UserStoragePermissionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user)
):
    """Add or update a storage permission for a user (admin only)."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    # Verify storage config exists
    config = db.query(StorageConfig).filter(
        StorageConfig.id == perm_data.storage_config_id
    ).first()
    if not config:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Storage configuration not found"
        )
    
    # Check for existing permission
    existing = db.query(UserStoragePermission).filter(
        and_(
            UserStoragePermission.user_id == user_id,
            UserStoragePermission.storage_config_id == perm_data.storage_config_id
        )
    ).first()
    
    if existing:
        # Update existing
        existing.permission = perm_data.permission
        db.commit()
        db.refresh(existing)
        return {
            "id": existing.id,
            "user_id": existing.user_id,
            "storage_config_id": existing.storage_config_id,
            "storage_config_name": config.name,
            "permission": existing.permission.value,
            "created_at": existing.created_at,
            "updated_at": existing.updated_at
        }
    
    # Create new permission
    new_perm = UserStoragePermission(
        user_id=user_id,
        storage_config_id=perm_data.storage_config_id,
        permission=perm_data.permission
    )
    db.add(new_perm)
    db.commit()
    db.refresh(new_perm)
    
    return {
        "id": new_perm.id,
        "user_id": new_perm.user_id,
        "storage_config_id": new_perm.storage_config_id,
        "storage_config_name": config.name,
        "permission": new_perm.permission.value,
        "created_at": new_perm.created_at,
        "updated_at": new_perm.updated_at
    }


@router.delete("/{user_id}/storage-permissions/{permission_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_user_storage_permission(
    user_id: int,
    permission_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user)
):
    """Remove a storage permission from a user (admin only)."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    permission = db.query(UserStoragePermission).filter(
        and_(
            UserStoragePermission.id == permission_id,
            UserStoragePermission.user_id == user_id
        )
    ).first()
    
    if not permission:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Permission not found"
        )
    
    db.delete(permission)
    db.commit()
    
    return None


# ========== Bucket Permission Management ==========

@router.get("/{user_id}/bucket-permissions", response_model=List[UserBucketPermissionResponse])
def get_user_bucket_permissions(
    user_id: int,
    storage_config_id: Optional[int] = Query(None, description="Filter by storage config"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user)
):
    """Get all bucket permissions for a user (admin only)."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    query = db.query(
        UserBucketPermission,
        StorageConfig.name.label('config_name')
    ).join(
        StorageConfig,
        UserBucketPermission.storage_config_id == StorageConfig.id
    ).filter(
        UserBucketPermission.user_id == user_id
    )
    
    if storage_config_id is not None:
        query = query.filter(UserBucketPermission.storage_config_id == storage_config_id)
    
    perms = query.all()
    
    return [
        {
            "id": p.UserBucketPermission.id,
            "user_id": p.UserBucketPermission.user_id,
            "storage_config_id": p.UserBucketPermission.storage_config_id,
            "storage_config_name": p.config_name,
            "bucket_name": p.UserBucketPermission.bucket_name,
            "permission": p.UserBucketPermission.permission.value if hasattr(p.UserBucketPermission.permission, 'value') else p.UserBucketPermission.permission,
            "created_at": p.UserBucketPermission.created_at,
            "updated_at": p.UserBucketPermission.updated_at
        }
        for p in perms
    ]


@router.post("/{user_id}/bucket-permissions", response_model=UserBucketPermissionResponse)
def add_user_bucket_permission(
    user_id: int,
    perm_data: UserBucketPermissionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user)
):
    """Add or update a bucket permission for a user (admin only)."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    # Verify storage config exists
    config = db.query(StorageConfig).filter(
        StorageConfig.id == perm_data.storage_config_id
    ).first()
    if not config:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Storage configuration not found"
        )
    
    # Check for existing permission
    existing = db.query(UserBucketPermission).filter(
        and_(
            UserBucketPermission.user_id == user_id,
            UserBucketPermission.storage_config_id == perm_data.storage_config_id,
            UserBucketPermission.bucket_name == perm_data.bucket_name
        )
    ).first()
    
    if existing:
        # Update existing
        existing.permission = perm_data.permission
        db.commit()
        db.refresh(existing)
        return {
            "id": existing.id,
            "user_id": existing.user_id,
            "storage_config_id": existing.storage_config_id,
            "storage_config_name": config.name,
            "bucket_name": existing.bucket_name,
            "permission": existing.permission.value,
            "created_at": existing.created_at,
            "updated_at": existing.updated_at
        }
    
    # Create new permission
    new_perm = UserBucketPermission(
        user_id=user_id,
        storage_config_id=perm_data.storage_config_id,
        bucket_name=perm_data.bucket_name,
        permission=perm_data.permission
    )
    db.add(new_perm)
    db.commit()
    db.refresh(new_perm)
    
    return {
        "id": new_perm.id,
        "user_id": new_perm.user_id,
        "storage_config_id": new_perm.storage_config_id,
        "storage_config_name": config.name,
        "bucket_name": new_perm.bucket_name,
        "permission": new_perm.permission.value,
        "created_at": new_perm.created_at,
        "updated_at": new_perm.updated_at
    }


@router.delete("/{user_id}/bucket-permissions/{permission_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_user_bucket_permission(
    user_id: int,
    permission_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user)
):
    """Remove a bucket permission from a user (admin only)."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    permission = db.query(UserBucketPermission).filter(
        and_(
            UserBucketPermission.id == permission_id,
            UserBucketPermission.user_id == user_id
        )
    ).first()
    
    if not permission:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Permission not found"
        )
    
    db.delete(permission)
    db.commit()
    
    return None


# ========== Helper Functions ==========

def _build_user_response(user: User, db: Session) -> dict:
    """Build a complete user response with permissions."""
    # Get storage permissions with config names
    storage_perms = db.query(
        UserStoragePermission,
        StorageConfig.name.label('config_name')
    ).join(
        StorageConfig,
        UserStoragePermission.storage_config_id == StorageConfig.id
    ).filter(
        UserStoragePermission.user_id == user.id
    ).all()
    
    # Get bucket permissions with config names
    bucket_perms = db.query(
        UserBucketPermission,
        StorageConfig.name.label('config_name')
    ).join(
        StorageConfig,
        UserBucketPermission.storage_config_id == StorageConfig.id
    ).filter(
        UserBucketPermission.user_id == user.id
    ).all()
    
    return {
        "id": user.id,
        "name": user.name,
        "email": user.email,
        "is_admin": user.is_admin,
        "is_active": user.is_active,
        "created_at": user.created_at,
        "storage_permissions": [
            {
                "id": p.UserStoragePermission.id,
                "user_id": p.UserStoragePermission.user_id,
                "storage_config_id": p.UserStoragePermission.storage_config_id,
                "storage_config_name": p.config_name,
                "permission": p.UserStoragePermission.permission.value if hasattr(p.UserStoragePermission.permission, 'value') else p.UserStoragePermission.permission,
                "created_at": p.UserStoragePermission.created_at,
                "updated_at": p.UserStoragePermission.updated_at
            }
            for p in storage_perms
        ],
        "bucket_permissions": [
            {
                "id": p.UserBucketPermission.id,
                "user_id": p.UserBucketPermission.user_id,
                "storage_config_id": p.UserBucketPermission.storage_config_id,
                "storage_config_name": p.config_name,
                "bucket_name": p.UserBucketPermission.bucket_name,
                "permission": p.UserBucketPermission.permission.value if hasattr(p.UserBucketPermission.permission, 'value') else p.UserBucketPermission.permission,
                "created_at": p.UserBucketPermission.created_at,
                "updated_at": p.UserBucketPermission.updated_at
            }
            for p in bucket_perms
        ]
    }
