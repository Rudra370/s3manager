"""
Hierarchical Permission System for S3 Manager

Permission Hierarchy:
1. Admin (is_admin=True) → Full access to everything
2. Storage Permission (none/read/read-write) → Default for all buckets in storage
3. Bucket Permission (none/read/read-write) → Override for specific bucket

Inheritance Rules:
- If storage permission is 'none' → User cannot see storage or any buckets
- If bucket permission is not set → Inherits from storage permission
- If bucket permission is set → Overrides storage permission
"""

from fastapi import HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import and_
from typing import Optional, List, Set, Dict

from app.models import (
    User, 
    UserStoragePermission, 
    UserBucketPermission, 
    StoragePermission,
    BucketPermission
)


# ========== Core Permission Resolution ==========

def get_storage_permission(
    user_id: int, 
    storage_config_id: int, 
    db: Session
) -> StoragePermission:
    """
    Get the permission level for a user on a storage config.
    
    Returns:
        StoragePermission: 'none', 'read', or 'read-write'
        Returns 'none' if no permission record exists.
    """
    perm = db.query(UserStoragePermission).filter(
        and_(
            UserStoragePermission.user_id == user_id,
            UserStoragePermission.storage_config_id == storage_config_id
        )
    ).first()
    
    return perm.permission if perm else StoragePermission.NONE


def get_bucket_permission(
    user_id: int,
    storage_config_id: int,
    bucket_name: str,
    db: Session
) -> BucketPermission:
    """
    Get the explicit bucket permission override for a user.
    
    Returns:
        BucketPermission or None: Returns None if no override exists
                                  (meaning inherit from storage)
    """
    perm = db.query(UserBucketPermission).filter(
        and_(
            UserBucketPermission.user_id == user_id,
            UserBucketPermission.storage_config_id == storage_config_id,
            UserBucketPermission.bucket_name == bucket_name
        )
    ).first()
    
    return perm.permission if perm else None


def get_effective_bucket_permission(
    user: User,
    storage_config_id: int,
    bucket_name: str,
    db: Session
) -> str:
    """
    Calculate the effective permission for a user on a specific bucket.
    
    This resolves the hierarchy: Admin → Storage Permission → Bucket Override
    
    Args:
        user: The user to check
        storage_config_id: The storage configuration ID
        bucket_name: The S3 bucket name
        db: Database session
        
    Returns:
        str: 'none', 'read', or 'read-write'
    """
    # Admins always have full access
    if user.is_admin:
        return 'read-write'
    
    # Check storage-level permission first
    storage_perm = get_storage_permission(user.id, storage_config_id, db)
    
    # If no storage access, no bucket access
    if storage_perm == StoragePermission.NONE:
        return 'none'
    
    # Check for bucket-level override
    bucket_override = get_bucket_permission(user.id, storage_config_id, bucket_name, db)
    
    if bucket_override is not None:
        # Explicit bucket permission overrides storage default
        return bucket_override.value
    else:
        # Inherit from storage permission
        return storage_perm.value


def get_effective_storage_permission(
    user: User,
    storage_config_id: int,
    db: Session
) -> str:
    """
    Get the effective permission for a user on a storage config.
    
    Returns:
        str: 'none', 'read', or 'read-write'
    """
    if user.is_admin:
        return 'read-write'
    
    return get_storage_permission(user.id, storage_config_id, db).value


# ========== Permission Check Functions ==========

def can_access_storage(
    user: User,
    storage_config_id: int,
    db: Session
) -> bool:
    """
    Check if user can access/see a storage configuration.
    
    Returns False if storage permission is 'none'.
    """
    if user.is_admin:
        return True
    
    perm = get_storage_permission(user.id, storage_config_id, db)
    return perm != StoragePermission.NONE


def can_read_storage(
    user: User,
    storage_config_id: int,
    db: Session
) -> bool:
    """
    Check if user can read from a storage configuration.
    
    Returns True for 'read' or 'read-write' permissions.
    """
    if user.is_admin:
        return True
    
    perm = get_storage_permission(user.id, storage_config_id, db)
    return perm in (StoragePermission.READ, StoragePermission.READ_WRITE)


def can_write_storage(
    user: User,
    storage_config_id: int,
    db: Session
) -> bool:
    """
    Check if user can write to/modify a storage configuration.
    
    Only returns True for 'read-write' permission.
    """
    if user.is_admin:
        return True
    
    perm = get_storage_permission(user.id, storage_config_id, db)
    return perm == StoragePermission.READ_WRITE


def can_access_bucket(
    user: User,
    storage_config_id: int,
    bucket_name: str,
    db: Session
) -> bool:
    """
    Check if user can see a bucket in listings.
    
    Returns False if effective permission is 'none'.
    """
    effective = get_effective_bucket_permission(user, storage_config_id, bucket_name, db)
    return effective != 'none'


def can_read_bucket(
    user: User,
    storage_config_id: int,
    bucket_name: str,
    db: Session
) -> bool:
    """
    Check if user can read from a bucket (list contents, download).
    
    Returns True for 'read' or 'read-write' permissions.
    """
    effective = get_effective_bucket_permission(user, storage_config_id, bucket_name, db)
    return effective in ('read', 'read-write')


def can_write_bucket(
    user: User,
    storage_config_id: int,
    bucket_name: str,
    db: Session
) -> bool:
    """
    Check if user can write to a bucket (upload, delete, modify).
    
    Only returns True for 'read-write' permission.
    """
    effective = get_effective_bucket_permission(user, storage_config_id, bucket_name, db)
    return effective == 'read-write'


# ========== Bulk Permission Queries ==========

def get_allowed_storage_ids(
    user: User,
    db: Session,
    permission_min: Optional[StoragePermission] = None
) -> List[int]:
    """
    Get list of storage config IDs the user can access.
    
    Args:
        user: The user
        db: Database session
        permission_min: Minimum permission level required (None = any access)
        
    Returns:
        List[int]: Storage config IDs. Empty list for admins (indicating "all").
    """
    if user.is_admin:
        return []  # Empty list means "all" for admins
    
    query = db.query(UserStoragePermission).filter(
        UserStoragePermission.user_id == user.id
    )
    
    if permission_min == StoragePermission.READ:
        query = query.filter(
            UserStoragePermission.permission.in_([
                StoragePermission.READ, 
                StoragePermission.READ_WRITE
            ])
        )
    elif permission_min == StoragePermission.READ_WRITE:
        query = query.filter(
            UserStoragePermission.permission == StoragePermission.READ_WRITE
        )
    else:
        # Default: any non-none permission
        query = query.filter(
            UserStoragePermission.permission != StoragePermission.NONE
        )
    
    return [p.storage_config_id for p in query.all()]


def get_visible_bucket_names(
    user: User,
    storage_config_id: int,
    all_bucket_names: List[str],
    db: Session
) -> Set[str]:
    """
    Filter bucket names to only those visible to the user.
    
    Args:
        user: The user
        storage_config_id: The storage configuration ID
        all_bucket_names: List of all bucket names from S3
        db: Database session
        
    Returns:
        Set[str]: Bucket names that should be visible to the user
    """
    if user.is_admin:
        return set(all_bucket_names)
    
    visible = set()
    
    # Get storage permission
    storage_perm = get_storage_permission(user.id, storage_config_id, db)
    
    # If no storage access, return empty
    if storage_perm == StoragePermission.NONE:
        return visible
    
    # Get all bucket overrides for this user + storage
    bucket_overrides = {
        p.bucket_name: p.permission 
        for p in db.query(UserBucketPermission).filter(
            and_(
                UserBucketPermission.user_id == user.id,
                UserBucketPermission.storage_config_id == storage_config_id
            )
        ).all()
    }
    
    for bucket_name in all_bucket_names:
        override = bucket_overrides.get(bucket_name)
        
        if override == BucketPermission.NONE:
            # Explicitly hidden
            continue
        elif override is not None:
            # Has explicit permission (read or read-write)
            visible.add(bucket_name)
        else:
            # No override - inherit from storage (which we know is not 'none')
            visible.add(bucket_name)
    
    return visible


def get_storage_permission_map(
    user: User,
    db: Session
) -> Dict[int, str]:
    """
    Get a mapping of storage config IDs to permission levels for a user.
    
    Returns:
        Dict[int, str]: {storage_config_id: permission}
                        Empty dict for admins (meaning "all" with "read-write")
    """
    if user.is_admin:
        return {}
    
    perms = db.query(UserStoragePermission).filter(
        and_(
            UserStoragePermission.user_id == user.id,
            UserStoragePermission.permission != StoragePermission.NONE
        )
    ).all()
    
    return {p.storage_config_id: p.permission.value for p in perms}


def get_bucket_permission_map(
    user: User,
    storage_config_id: int,
    db: Session
) -> Dict[str, str]:
    """
    Get a mapping of bucket names to their override permissions.
    
    Returns:
        Dict[str, str]: {bucket_name: permission}
                        Only includes buckets with explicit overrides
    """
    if user.is_admin:
        return {}
    
    perms = db.query(UserBucketPermission).filter(
        and_(
            UserBucketPermission.user_id == user.id,
            UserBucketPermission.storage_config_id == storage_config_id
        )
    ).all()
    
    return {p.bucket_name: p.permission.value for p in perms}


# ========== Requirement Functions (raise HTTPException) ==========

def require_storage_access(
    user: User,
    storage_config_id: int,
    db: Session
):
    """Raise 403 if user cannot access storage config."""
    if not can_access_storage(user, storage_config_id, db):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied to this storage configuration"
        )


def require_storage_read(
    user: User,
    storage_config_id: int,
    db: Session
):
    """Raise 403 if user cannot read from storage config."""
    if not can_read_storage(user, storage_config_id, db):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Read access denied to this storage configuration"
        )


def require_storage_write(
    user: User,
    storage_config_id: int,
    db: Session
):
    """Raise 403 if user cannot write to storage config."""
    if not can_write_storage(user, storage_config_id, db):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Write access denied to this storage configuration"
        )


def require_bucket_access(
    user: User,
    storage_config_id: int,
    bucket_name: str,
    db: Session
):
    """Raise 403 if user cannot see/access bucket."""
    if not can_access_bucket(user, storage_config_id, bucket_name, db):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Access denied to bucket '{bucket_name}'"
        )


def require_bucket_read(
    user: User,
    storage_config_id: int,
    bucket_name: str,
    db: Session
):
    """Raise 403 if user cannot read from bucket."""
    if not can_read_bucket(user, storage_config_id, bucket_name, db):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Read access denied to bucket '{bucket_name}'"
        )


def require_bucket_write(
    user: User,
    storage_config_id: int,
    bucket_name: str,
    db: Session
):
    """Raise 403 if user cannot write to bucket."""
    if not can_write_bucket(user, storage_config_id, bucket_name, db):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Write access denied to bucket '{bucket_name}'"
        )


# ========== Legacy Compatibility Functions ==========

def filter_buckets_by_permission(
    user: User,
    buckets: List[dict],
    storage_config_id: int,
    db: Session
) -> List[dict]:
    """
    Filter S3 bucket list to only those the user can access.
    
    Args:
        user: The user
        buckets: List of bucket dicts with 'name' key
        storage_config_id: The storage configuration ID
        db: Database session
        
    Returns:
        List[dict]: Filtered bucket list
    """
    if user.is_admin:
        return buckets
    
    # Get storage permission
    storage_perm = get_storage_permission(user.id, storage_config_id, db)
    
    # If no storage access, return empty
    if storage_perm == StoragePermission.NONE:
        return []
    
    # Get bucket overrides
    bucket_names = [b['name'] for b in buckets]
    visible_names = get_visible_bucket_names(user, storage_config_id, bucket_names, db)
    
    return [b for b in buckets if b['name'] in visible_names]


def get_allowed_buckets(
    user: User,
    storage_config_id: int,
    db: Session
) -> Set[str]:
    """
    Legacy function: Get set of bucket names user can access.
    
    Note: This now requires explicit bucket permissions or storage-level access
    with inheritance. Returns empty set for admins (meaning "all").
    """
    if user.is_admin:
        return set()  # Empty set means "all" for admins
    
    storage_perm = get_storage_permission(user.id, storage_config_id, db)
    
    if storage_perm == StoragePermission.NONE:
        return set()
    
    # Get all bucket overrides
    overrides = db.query(UserBucketPermission).filter(
        and_(
            UserBucketPermission.user_id == user.id,
            UserBucketPermission.storage_config_id == storage_config_id
        )
    ).all()
    
    # Build set of accessible buckets
    accessible = set()
    hidden = set()
    
    for override in overrides:
        if override.permission == BucketPermission.NONE:
            hidden.add(override.bucket_name)
        else:
            accessible.add(override.bucket_name)
    
    # Note: We can't return "all" buckets since we don't know the full list
    # This function is mainly for backward compatibility
    return accessible
