from pydantic import BaseModel, EmailStr
from datetime import datetime
from typing import Optional, List, Dict, Any
from enum import Enum


# ========== Enums ==========
class StoragePermission(str, Enum):
    """Permission levels for storage configurations."""
    NONE = "none"
    READ = "read"
    READ_WRITE = "read-write"


class BucketPermission(str, Enum):
    """Permission levels for buckets."""
    NONE = "none"
    READ = "read"
    READ_WRITE = "read-write"


class UserRole(str, Enum):
    """User role - primarily for backward compatibility."""
    ADMIN = "admin"
    READ_WRITE = "read-write"
    READ_ONLY = "read-only"


# ========== Storage Config Schemas ==========
class StorageConfigBase(BaseModel):
    name: str
    endpoint_url: Optional[str] = None
    region: str = "us-east-1"
    use_ssl: bool = True
    verify_ssl: bool = True
    is_active: bool = True


class StorageConfigCreate(StorageConfigBase):
    access_key: Optional[str] = None
    secret_key: Optional[str] = None


class StorageConfigUpdate(BaseModel):
    name: Optional[str] = None
    endpoint_url: Optional[str] = None
    access_key: Optional[str] = None
    secret_key: Optional[str] = None
    region: Optional[str] = None
    use_ssl: Optional[bool] = None
    verify_ssl: Optional[bool] = None
    is_active: Optional[bool] = None


class StorageConfigResponse(BaseModel):
    id: int
    name: str
    endpoint_url: Optional[str] = None
    access_key: Optional[str] = None  # Masked access key
    region: str
    use_ssl: bool
    verify_ssl: bool
    is_active: bool
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True
    
    @classmethod
    def from_orm(cls, obj):
        """Override to mask sensitive data"""
        data = {
            "id": obj.id,
            "name": obj.name,
            "endpoint_url": obj.endpoint_url,
            "access_key": obj.aws_access_key_id[:4] + "****" if obj.aws_access_key_id else None,
            "region": obj.region_name,
            "use_ssl": obj.use_ssl,
            "verify_ssl": obj.verify_ssl,
            "is_active": obj.is_active,
            "created_at": obj.created_at,
            "updated_at": obj.updated_at,
        }
        return cls(**data)


class StorageConfigListResponse(BaseModel):
    configs: List[StorageConfigResponse]


class StorageConfigSimpleResponse(BaseModel):
    """Simplified response for dropdowns/lists"""
    id: int
    name: str
    is_active: bool
    
    class Config:
        from_attributes = True


# ========== Storage Permission Schemas ==========
class UserStoragePermissionBase(BaseModel):
    storage_config_id: int
    permission: StoragePermission


class UserStoragePermissionCreate(BaseModel):
    storage_config_id: int
    permission: StoragePermission


class UserStoragePermissionUpdate(BaseModel):
    permission: StoragePermission


class UserStoragePermissionResponse(BaseModel):
    id: int
    user_id: int
    storage_config_id: int
    storage_config_name: Optional[str] = None
    permission: StoragePermission
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True


class UserStoragePermissionListResponse(BaseModel):
    permissions: List[UserStoragePermissionResponse]


# ========== Bucket Permission Schemas ==========
class UserBucketPermissionBase(BaseModel):
    storage_config_id: int
    bucket_name: str
    permission: BucketPermission


class UserBucketPermissionCreate(BaseModel):
    storage_config_id: int
    bucket_name: str
    permission: BucketPermission


class UserBucketPermissionUpdate(BaseModel):
    permission: BucketPermission


class UserBucketPermissionResponse(BaseModel):
    id: int
    user_id: int
    storage_config_id: int
    storage_config_name: Optional[str] = None
    bucket_name: str
    permission: BucketPermission
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True


class UserBucketPermissionListResponse(BaseModel):
    permissions: List[UserBucketPermissionResponse]


# ========== User Schemas ==========
class UserBase(BaseModel):
    name: str
    email: EmailStr


class UserCreate(UserBase):
    password: str
    is_admin: bool = False
    storage_permissions: Optional[List[UserStoragePermissionCreate]] = None
    bucket_permissions: Optional[List[UserBucketPermissionCreate]] = None


class UserUpdate(BaseModel):
    name: Optional[str] = None
    email: Optional[EmailStr] = None
    is_admin: Optional[bool] = None
    is_active: Optional[bool] = None
    storage_permissions: Optional[List[UserStoragePermissionCreate]] = None
    bucket_permissions: Optional[List[UserBucketPermissionCreate]] = None


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class UserResponse(UserBase):
    id: int
    is_admin: bool
    is_active: bool
    created_at: datetime
    storage_permissions: Optional[List[UserStoragePermissionResponse]] = None
    bucket_permissions: Optional[List[UserBucketPermissionResponse]] = None
    
    class Config:
        from_attributes = True


class UserListResponse(BaseModel):
    users: List[UserResponse]


# ========== Shared Link Schemas ==========
class SharedLinkCreate(BaseModel):
    storage_config_id: int
    bucket_name: str
    object_key: str
    expires_in_hours: Optional[float] = None  # null = never expires
    password: Optional[str] = None
    max_downloads: Optional[int] = None


class SharedLinkResponse(BaseModel):
    id: int
    share_token: str
    storage_config_id: int
    bucket_name: str
    object_key: str
    share_url: str
    created_by: int
    creator_name: Optional[str] = None
    expires_at: Optional[datetime] = None
    max_downloads: Optional[int] = None
    download_count: int
    is_active: bool
    is_expired: bool
    is_password_protected: bool
    created_at: datetime
    
    class Config:
        from_attributes = True


class SharedLinkListResponse(BaseModel):
    shares: List[SharedLinkResponse]


class SharedLinkAccessRequest(BaseModel):
    password: Optional[str] = None


class SharedLinkAccessResponse(BaseModel):
    storage_config_id: int
    bucket_name: str
    object_key: str
    filename: str
    size_formatted: Optional[str] = None
    content_type: Optional[str] = None
    is_password_protected: bool
    requires_password: bool
    expires_at: Optional[datetime] = None
    is_expired: bool


class UserProfileResponse(UserBase):
    id: int
    is_admin: bool
    is_active: bool
    created_at: datetime
    
    class Config:
        from_attributes = True


# ========== Token Schemas ==========
class Token(BaseModel):
    access_token: str
    token_type: str


class TokenData(BaseModel):
    email: Optional[str] = None


# ========== Legacy S3 Config Schemas (for backward compatibility) ==========
class S3ConfigBase(BaseModel):
    endpoint_url: Optional[str] = None
    access_key: Optional[str] = None
    secret_key: Optional[str] = None
    region: str = "us-east-1"
    use_ssl: bool = True
    verify_ssl: bool = True


class S3ConfigCreate(S3ConfigBase):
    pass


class S3ConfigResponse(BaseModel):
    configured: bool
    endpoint_url: Optional[str] = None
    region: str
    use_ssl: bool
    has_credentials: bool


# ========== Setup Schema ==========
class SetupRequest(BaseModel):
    name: str
    email: EmailStr
    password: str
    storage_config_name: str = "default"
    endpoint_url: Optional[str] = None
    access_key: Optional[str] = None
    secret_key: Optional[str] = None
    region: str = "us-east-1"
    use_ssl: bool = True
    verify_ssl: bool = True
    heading_text: Optional[str] = None
    logo_url: Optional[str] = None


class AppConfigResponse(BaseModel):
    heading_text: str = "S3 Manager"
    logo_url: Optional[str] = None
    
    class Config:
        from_attributes = True


class SetupStatusResponse(BaseModel):
    setup_complete: bool
    has_users: bool
    app_config: Optional[AppConfigResponse] = None


# ========== Bucket Schemas ==========
class Bucket(BaseModel):
    name: str
    creation_date: datetime


class BucketList(BaseModel):
    buckets: List[Bucket]


class BucketCreate(BaseModel):
    name: str


class BucketDelete(BaseModel):
    name: str


# ========== Object Schemas ==========
class S3Object(BaseModel):
    name: str
    key: str
    size: int
    size_formatted: str
    last_modified: datetime
    etag: str
    type: str  # 'file' or 'directory'
    content_type: Optional[str] = None


class Directory(BaseModel):
    name: str
    prefix: str
    type: str = "directory"


class ObjectList(BaseModel):
    directories: List[Directory]
    objects: List[S3Object]
    prefix: str
    is_truncated: bool
    next_continuation_token: Optional[str] = None


class ObjectDelete(BaseModel):
    key: str


class BulkDeleteRequest(BaseModel):
    keys: List[str]


class PrefixCreate(BaseModel):
    prefix: str


class ObjectMetadata(BaseModel):
    key: str
    size: int
    size_formatted: str
    content_type: str
    last_modified: datetime
    etag: str
    metadata: Dict[str, Any]


class SizeProgress(BaseModel):
    key: str
    size: int
    size_formatted: str
    status: str  # 'calculating', 'complete', 'error'
