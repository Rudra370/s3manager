"""Initial schema - create all tables

Revision ID: 001
Revises: 
Create Date: 2026-02-05 17:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = '001'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Create enum types using DO blocks to check for existence first
    op.execute("""
        DO $$
        BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'userrole') THEN
                CREATE TYPE userrole AS ENUM ('admin', 'read-write', 'read-only');
            END IF;
        END
        $$;
    """)
    
    op.execute("""
        DO $$
        BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'storagepermission') THEN
                CREATE TYPE storagepermission AS ENUM ('none', 'read', 'read-write');
            END IF;
        END
        $$;
    """)
    
    op.execute("""
        DO $$
        BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'bucketpermission') THEN
                CREATE TYPE bucketpermission AS ENUM ('none', 'read', 'read-write');
            END IF;
        END
        $$;
    """)
    
    # Create users table
    op.create_table(
        'users',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(), nullable=False),
        sa.Column('email', sa.String(), nullable=False),
        sa.Column('hashed_password', sa.String(), nullable=False),
        sa.Column('is_admin', sa.Boolean(), default=False),
        sa.Column('role', postgresql.ENUM('admin', 'read-write', 'read-only', name='userrole', create_type=False), default='read-only'),
        sa.Column('is_active', sa.Boolean(), default=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_users_email'), 'users', ['email'], unique=True)
    op.create_index(op.f('ix_users_id'), 'users', ['id'], unique=False)
    
    # Create storage_configs table
    op.create_table(
        'storage_configs',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(), nullable=False),
        sa.Column('endpoint_url', sa.String(), nullable=True),
        sa.Column('aws_access_key_id', sa.String(), nullable=True),
        sa.Column('aws_secret_access_key', sa.String(), nullable=True),
        sa.Column('region_name', sa.String(), default='us-east-1'),
        sa.Column('use_ssl', sa.Boolean(), default=True),
        sa.Column('verify_ssl', sa.Boolean(), default=True),
        sa.Column('is_active', sa.Boolean(), default=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), onupdate=sa.func.now()),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('name')
    )
    op.create_index(op.f('ix_storage_configs_name'), 'storage_configs', ['name'], unique=True)
    
    # Create app_config table
    op.create_table(
        'app_config',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('heading_text', sa.String(), default='S3 Manager'),
        sa.Column('logo_url', sa.String(), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), onupdate=sa.func.now()),
        sa.PrimaryKeyConstraint('id')
    )
    
    # Create user_storage_permissions table
    op.create_table(
        'user_storage_permissions',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('storage_config_id', sa.Integer(), sa.ForeignKey('storage_configs.id', ondelete='CASCADE'), nullable=False),
        sa.Column('permission', postgresql.ENUM('none', 'read', 'read-write', name='storagepermission', create_type=False), nullable=False, default='none'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), onupdate=sa.func.now()),
        sa.PrimaryKeyConstraint('id'),
        sa.Index('idx_user_storage', 'user_id', 'storage_config_id', unique=True)
    )
    
    # Create user_bucket_permissions table
    op.create_table(
        'user_bucket_permissions',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('storage_config_id', sa.Integer(), sa.ForeignKey('storage_configs.id', ondelete='CASCADE'), nullable=False),
        sa.Column('bucket_name', sa.String(), nullable=False),
        sa.Column('permission', postgresql.ENUM('none', 'read', 'read-write', name='bucketpermission', create_type=False), nullable=False, default='read'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), onupdate=sa.func.now()),
        sa.PrimaryKeyConstraint('id'),
        sa.Index('idx_user_bucket_storage', 'user_id', 'storage_config_id', 'bucket_name', unique=True)
    )
    
    # Create shared_links table
    op.create_table(
        'shared_links',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('share_token', sa.String(), nullable=False),
        sa.Column('storage_config_id', sa.Integer(), sa.ForeignKey('storage_configs.id', ondelete='CASCADE'), nullable=False),
        sa.Column('bucket_name', sa.String(), nullable=False),
        sa.Column('object_key', sa.String(), nullable=False),
        sa.Column('created_by', sa.Integer(), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('password_hash', sa.String(), nullable=True),
        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('max_downloads', sa.Integer(), nullable=True),
        sa.Column('download_count', sa.Integer(), default=0),
        sa.Column('is_active', sa.Boolean(), default=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('last_accessed_at', sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('share_token')
    )
    op.create_index(op.f('ix_shared_links_share_token'), 'shared_links', ['share_token'], unique=True)


def downgrade() -> None:
    # Drop tables in reverse order
    op.drop_index(op.f('ix_shared_links_share_token'), table_name='shared_links')
    op.drop_table('shared_links')
    op.drop_table('user_bucket_permissions')
    op.drop_table('user_storage_permissions')
    op.drop_table('app_config')
    op.drop_index(op.f('ix_storage_configs_name'), table_name='storage_configs')
    op.drop_table('storage_configs')
    op.drop_index(op.f('ix_users_id'), table_name='users')
    op.drop_index(op.f('ix_users_email'), table_name='users')
    op.drop_table('users')
    
    # Drop enum types
    op.execute("DROP TYPE IF EXISTS bucketpermission")
    op.execute("DROP TYPE IF EXISTS storagepermission")
    op.execute("DROP TYPE IF EXISTS userrole")
