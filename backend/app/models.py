from sqlalchemy import Column, Integer, String, DateTime, Boolean, ForeignKey, Index
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from sqlalchemy.dialects import postgresql
from app.database import Base
import enum


class StoragePermission(str, enum.Enum):
    """Permission levels for storage configurations."""
    NONE = "none"           # No access - storage is hidden
    READ = "read"           # Read-only access
    READ_WRITE = "read-write"  # Full read/write access


class BucketPermission(str, enum.Enum):
    """Permission levels for buckets (with inheritance from storage)."""
    NONE = "none"           # Explicitly hidden (override)
    READ = "read"           # Read-only (override or inherit)
    READ_WRITE = "read-write"  # Full access (override or inherit)


class UserRole(str, enum.Enum):
    """User role - primarily for backward compatibility."""
    ADMIN = "admin"
    READ_WRITE = "read-write"
    READ_ONLY = "read-only"


class User(Base):
    __tablename__ = "users"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    email = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    is_admin = Column(Boolean, default=False)
    role = Column(postgresql.ENUM('admin', 'read-write', 'read-only', name='userrole', create_type=False), default='read-only')
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    # Relationships
    storage_permissions = relationship("UserStoragePermission", back_populates="user", cascade="all, delete-orphan")
    bucket_permissions = relationship("UserBucketPermission", back_populates="user", cascade="all, delete-orphan")


class StorageConfig(Base):
    __tablename__ = "storage_configs"
    
    id = Column(Integer, primary_key=True)
    name = Column(String, unique=True, nullable=False, index=True)
    endpoint_url = Column(String, nullable=True)
    aws_access_key_id = Column(String, nullable=True)
    aws_secret_access_key = Column(String, nullable=True)
    region_name = Column(String, default="us-east-1")
    use_ssl = Column(Boolean, default=True)
    verify_ssl = Column(Boolean, default=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    
    # Relationships
    user_storage_permissions = relationship("UserStoragePermission", back_populates="storage_config", cascade="all, delete-orphan")
    user_bucket_permissions = relationship("UserBucketPermission", back_populates="storage_config", cascade="all, delete-orphan")


class AppConfig(Base):
    __tablename__ = "app_config"
    
    id = Column(Integer, primary_key=True)
    heading_text = Column(String, default="S3 Manager")
    logo_url = Column(String, nullable=True)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class UserStoragePermission(Base):
    """
    Storage-level permissions for users.
    
    This controls:
    - Whether the user can see the storage config at all
    - Default permission for all buckets within this storage
    """
    __tablename__ = "user_storage_permissions"
    
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    storage_config_id = Column(Integer, ForeignKey("storage_configs.id", ondelete="CASCADE"), nullable=False)
    permission = Column(postgresql.ENUM('none', 'read', 'read-write', name='storagepermission', create_type=False), nullable=False, default='none')
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    
    # Relationships
    user = relationship("User", back_populates="storage_permissions")
    storage_config = relationship("StorageConfig", back_populates="user_storage_permissions")
    
    # Unique constraint: one permission per user per storage
    __table_args__ = (
        Index('idx_user_storage', 'user_id', 'storage_config_id', unique=True),
    )


class UserBucketPermission(Base):
    """
    Bucket-level permissions for users (optional overrides).
    
    If a record exists, it overrides the storage-level permission for this bucket.
    If no record exists, the bucket inherits from storage-level permission.
    
    'none' = bucket is explicitly hidden even if storage has access
    'read' = read-only for this bucket (can upgrade or downgrade from storage)
    'read-write' = full access for this bucket
    """
    __tablename__ = "user_bucket_permissions"
    
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    storage_config_id = Column(Integer, ForeignKey("storage_configs.id", ondelete="CASCADE"), nullable=False)
    bucket_name = Column(String, nullable=False)
    permission = Column(postgresql.ENUM('none', 'read', 'read-write', name='bucketpermission', create_type=False), nullable=False, default='read')
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    
    # Relationships
    user = relationship("User", back_populates="bucket_permissions")
    storage_config = relationship("StorageConfig", back_populates="user_bucket_permissions")
    
    # Unique constraint: one permission per user per bucket per storage
    __table_args__ = (
        Index('idx_user_bucket_storage', 'user_id', 'storage_config_id', 'bucket_name', unique=True),
    )


class SharedLink(Base):
    __tablename__ = "shared_links"
    
    id = Column(Integer, primary_key=True)
    share_token = Column(String, unique=True, index=True, nullable=False)
    storage_config_id = Column(Integer, ForeignKey("storage_configs.id", ondelete="CASCADE"), nullable=False)
    bucket_name = Column(String, nullable=False)
    object_key = Column(String, nullable=False)
    created_by = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    
    # Optional security settings
    password_hash = Column(String, nullable=True)  # bcrypt hashed
    expires_at = Column(DateTime(timezone=True), nullable=True)  # null = never expires
    max_downloads = Column(Integer, nullable=True)  # null = unlimited
    download_count = Column(Integer, default=0)
    
    # Status
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    last_accessed_at = Column(DateTime(timezone=True), nullable=True)
    
    # Relationships
    creator = relationship("User")
