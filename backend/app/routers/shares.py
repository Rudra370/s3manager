"""
Shared Links Router - Shareable URLs for objects
"""

import secrets
from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException, status, Request
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from typing import Optional

from app.database import get_db
from app.models import User, SharedLink, StorageConfig
from app.schemas import (
    SharedLinkCreate, SharedLinkResponse, SharedLinkListResponse,
    SharedLinkAccessRequest, SharedLinkAccessResponse
)
from app.auth import get_current_active_user, verify_password, get_password_hash
from app.permissions import can_write_bucket
from app.s3_client import get_s3_manager_from_config
from app.tasks import delete_share_task

router = APIRouter(prefix="/api/shares", tags=["shares"])

# Constants
DOWNLOAD_CHUNK_SIZE = 8192


def generate_share_token() -> str:
    """Generate a URL-safe random token for sharing."""
    return secrets.token_urlsafe(32)


@router.post("/create", response_model=SharedLinkResponse)
def create_share(
    data: SharedLinkCreate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Create a shareable link for an object.
    Requires write permission to the bucket.
    """
    # Check if user has write access to the bucket
    if not can_write_bucket(current_user, data.storage_config_id, data.bucket_name, db):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Write access required to create share links"
        )
    
    # Validate password if provided
    if data.password and len(data.password) < 4:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Password must be at least 4 characters"
        )
    
    # Calculate expiration
    expires_at = None
    if data.expires_in_hours:
        expires_at = datetime.utcnow() + timedelta(hours=data.expires_in_hours)
    
    # Create share
    share = SharedLink(
        share_token=generate_share_token(),
        storage_config_id=data.storage_config_id,
        bucket_name=data.bucket_name,
        object_key=data.object_key,
        created_by=current_user.id,
        password_hash=get_password_hash(data.password) if data.password else None,
        expires_at=expires_at,
        max_downloads=data.max_downloads,
        download_count=0,
        is_active=True
    )
    
    db.add(share)
    db.commit()
    db.refresh(share)
    
    # Build share URL
    base_url = str(request.base_url).rstrip('/')
    share_url = f"{base_url}/s/{share.share_token}"
    
    return {
        "id": share.id,
        "share_token": share.share_token,
        "storage_config_id": share.storage_config_id,
        "bucket_name": share.bucket_name,
        "object_key": share.object_key,
        "share_url": share_url,
        "created_by": share.created_by,
        "creator_name": current_user.name,
        "expires_at": share.expires_at,
        "max_downloads": share.max_downloads,
        "download_count": share.download_count,
        "is_active": share.is_active,
        "is_expired": share.expires_at and share.expires_at < datetime.utcnow(),
        "is_password_protected": share.password_hash is not None,
        "created_at": share.created_at
    }


@router.get("/list", response_model=SharedLinkListResponse)
def list_shares(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    List shareable links.
    - Admins see all shares
    - Regular users see only their own shares
    """
    query = db.query(SharedLink, User.name.label("creator_name")).join(User, SharedLink.created_by == User.id)
    
    # Non-admins only see their own shares
    if not current_user.is_admin:
        query = query.filter(SharedLink.created_by == current_user.id)
    
    # Order by newest first
    query = query.order_by(SharedLink.created_at.desc())
    
    results = query.all()
    
    shares = []
    for share, creator_name in results:
        is_expired = share.expires_at and share.expires_at < datetime.utcnow()
        shares.append({
            "id": share.id,
            "share_token": share.share_token,
            "storage_config_id": share.storage_config_id,
            "bucket_name": share.bucket_name,
            "object_key": share.object_key,
            "share_url": f"/s/{share.share_token}",  # Relative URL
            "created_by": share.created_by,
            "creator_name": creator_name,
            "expires_at": share.expires_at,
            "max_downloads": share.max_downloads,
            "download_count": share.download_count,
            "is_active": share.is_active and not is_expired,
            "is_expired": is_expired,
            "is_password_protected": share.password_hash is not None,
            "created_at": share.created_at
        })
    
    return {"shares": shares}


# Public routes (no authentication required) - MUST be defined before /{share_id} route
@router.get("/public/{token}", response_model=SharedLinkAccessResponse)
def get_share_info(
    token: str,
    db: Session = Depends(get_db)
):
    """
    Get information about a shared link (for preview page).
    Does not require authentication.
    """
    share = db.query(SharedLink).filter(
        SharedLink.share_token == token,
        SharedLink.is_active == True
    ).first()
    
    if not share:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Share not found or has been revoked"
        )
    
    # Check if expired
    if share.expires_at and share.expires_at < datetime.utcnow():
        raise HTTPException(
            status_code=status.HTTP_410_GONE,
            detail="This share link has expired"
        )
    
    # Check download limit
    if share.max_downloads and share.download_count >= share.max_downloads:
        raise HTTPException(
            status_code=status.HTTP_410_GONE,
            detail="Download limit reached for this share"
        )
    
    # Get file metadata from S3 using the share's storage config
    config = db.query(StorageConfig).filter(
        StorageConfig.id == share.storage_config_id,
        StorageConfig.is_active == True
    ).first()
    size_formatted = None
    content_type = None
    
    if config:
        try:
            s3_manager = get_s3_manager_from_config(config)
            metadata = s3_manager.get_object_metadata(share.bucket_name, share.object_key)
            if metadata and not metadata.get('error'):
                size_formatted = metadata.get('size_formatted')
                content_type = metadata.get('content_type')
        except Exception:
            pass  # Silently fail, not critical
    
    filename = share.object_key.split('/')[-1]
    
    return {
        "storage_config_id": share.storage_config_id,
        "bucket_name": share.bucket_name,
        "object_key": share.object_key,
        "filename": filename,
        "size_formatted": size_formatted,
        "content_type": content_type,
        "is_password_protected": share.password_hash is not None,
        "requires_password": share.password_hash is not None,
        "expires_at": share.expires_at,
        "is_expired": share.expires_at and share.expires_at < datetime.utcnow()
    }


@router.post("/public/{token}/access")
def access_share(
    token: str,
    request_data: SharedLinkAccessRequest,
    db: Session = Depends(get_db)
):
    """
    Access a password-protected share.
    Returns success if password is correct.
    """
    share = db.query(SharedLink).filter(
        SharedLink.share_token == token,
        SharedLink.is_active == True
    ).first()
    
    if not share:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Share not found"
        )
    
    # Check if expired
    if share.expires_at and share.expires_at < datetime.utcnow():
        raise HTTPException(
            status_code=status.HTTP_410_GONE,
            detail="This share link has expired"
        )
    
    # Verify password if required
    if share.password_hash:
        if not request_data.password:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Password required"
            )
        if not verify_password(request_data.password, share.password_hash):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Invalid password"
            )
    
    return {"success": True, "message": "Access granted"}


@router.get("/public/{token}/download")
def download_shared_file(
    token: str,
    password: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """
    Download a file via share token.
    """
    share = db.query(SharedLink).filter(
        SharedLink.share_token == token,
        SharedLink.is_active == True
    ).first()
    
    if not share:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Share not found"
        )
    
    # Check if expired
    if share.expires_at and share.expires_at < datetime.utcnow():
        raise HTTPException(
            status_code=status.HTTP_410_GONE,
            detail="This share link has expired"
        )
    
    # Check download limit
    if share.max_downloads and share.download_count >= share.max_downloads:
        raise HTTPException(
            status_code=status.HTTP_410_GONE,
            detail="Download limit reached"
        )
    
    # Verify password if required
    if share.password_hash:
        if not password:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Password required"
            )
        if not verify_password(password, share.password_hash):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Invalid password"
            )
    
    # Get S3 config from the share's storage config
    config = db.query(StorageConfig).filter(
        StorageConfig.id == share.storage_config_id,
        StorageConfig.is_active == True
    ).first()
    if not config:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Storage configuration not found or inactive"
        )
    
    # Download from S3
    s3_manager = get_s3_manager_from_config(config)
    
    try:
        response, error = s3_manager.download_object(share.bucket_name, share.object_key)
        if error:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"File not found or access denied: {error}"
            )
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="File not found or access denied"
        )
    
    # Increment download count
    share.download_count += 1
    share.last_accessed_at = datetime.utcnow()
    
    # Auto-delete if max downloads reached
    if share.max_downloads and share.download_count >= share.max_downloads:
        # Schedule deletion as background task
        delete_share_task.delay(share.id)
    
    db.commit()
    
    filename = share.object_key.split('/')[-1]
    
    def generate():
        for chunk in response['Body'].iter_chunks(chunk_size=DOWNLOAD_CHUNK_SIZE):
            yield chunk
    
    return StreamingResponse(
        generate(),
        media_type=response.get('ContentType', 'application/octet-stream'),
        headers={
            'Content-Disposition': f'attachment; filename="{filename}"'
        }
    )


# Protected routes with path parameters - defined last to avoid conflicts with public routes
@router.delete("/{share_id}")
def delete_share(
    share_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Revoke/delete a shareable link.
    - Creator can delete their own shares
    - Admins can delete any share
    """
    share = db.query(SharedLink).filter(SharedLink.id == share_id).first()
    
    if not share:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Share not found"
        )
    
    # Check permissions
    if share.created_by != current_user.id and not current_user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only delete your own shares"
        )
    
    db.delete(share)
    db.commit()
    
    return {"success": True, "message": "Share revoked successfully"}
