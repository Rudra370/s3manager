import os
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status, Response
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.database import get_db
from app.models import User, StorageConfig, AppConfig
from app.schemas import SetupRequest, S3ConfigResponse, AppConfigResponse
from app.auth import get_password_hash, create_access_token
from app.s3_client import get_s3_manager

router = APIRouter(prefix="/api/admin", tags=["admin"])

# Constants
COOKIE_MAX_AGE = 7 * 24 * 60 * 60  # 7 days


@router.get("/setup-status")
def get_setup_status(db: Session = Depends(get_db)):
    """Check if initial setup has been completed. Returns app config if setup is complete."""
    user_count = db.query(func.count(User.id)).scalar()
    setup_complete = user_count > 0
    
    response = {
        "setup_complete": setup_complete,
        "has_users": setup_complete
    }
    
    # Include app config if setup is complete
    if setup_complete:
        app_config = db.query(AppConfig).first()
        if app_config:
            response["app_config"] = {
                "heading_text": app_config.heading_text or "S3 Manager",
                "logo_url": app_config.logo_url
            }
        else:
            response["app_config"] = {
                "heading_text": "S3 Manager",
                "logo_url": None
            }
    
    return response


@router.post("/setup")
def setup_application(response: Response, setup_data: SetupRequest, db: Session = Depends(get_db)):
    """Complete initial setup - create first admin user and Storage config."""
    try:
        # Check if setup is already done
        user_count = db.query(func.count(User.id)).scalar()
        if user_count > 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Setup already completed"
            )
        
        # Validate S3 connection first
        # Use non-cached version for setup since storage_config doesn't exist yet
        s3_manager = get_s3_manager(
            endpoint_url=setup_data.endpoint_url,
            aws_access_key_id=setup_data.access_key,
            aws_secret_access_key=setup_data.secret_key,
            region_name=setup_data.region,
            use_ssl=setup_data.use_ssl,
            verify=setup_data.verify_ssl
        )
        
        connection_ok, error = s3_manager.test_connection()
        if not connection_ok:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"S3 connection failed: {error}"
            )
        
        # Create admin user
        hashed_password = get_password_hash(setup_data.password)
        admin_user = User(
            name=setup_data.name,
            email=setup_data.email,
            hashed_password=hashed_password,
            is_admin=True
        )
        db.add(admin_user)
        
        # Save Storage configuration (first config is default)
        storage_config_name = getattr(setup_data, 'storage_config_name', None) or "Default Storage"
        storage_config = StorageConfig(
            name=storage_config_name,
            endpoint_url=setup_data.endpoint_url,
            aws_access_key_id=setup_data.access_key,
            aws_secret_access_key=setup_data.secret_key,
            region_name=setup_data.region,
            use_ssl=setup_data.use_ssl,
            verify_ssl=setup_data.verify_ssl,
            is_active=True
        )
        db.add(storage_config)
        
        # Save App configuration
        app_config = AppConfig(
            heading_text=setup_data.heading_text or "S3 Manager",
            logo_url=setup_data.logo_url
        )
        db.add(app_config)
        
        db.commit()
        
        # Create access token
        access_token = create_access_token(data={"sub": admin_user.email})
        
        # Set cookie
        response.set_cookie(
            key="access_token",
            value=access_token,
            httponly=True,
            secure=os.getenv("COOKIE_SECURE", "false").lower() == "true",
            samesite="lax",
            max_age=COOKIE_MAX_AGE,
        )
        
        return {
            "success": True,
            "message": "Setup completed successfully",
            "access_token": access_token,
            "token_type": "bearer",
            "user": {
                "id": admin_user.id,
                "name": admin_user.name,
                "email": admin_user.email,
                "is_admin": admin_user.is_admin
            }
        }
    except HTTPException:
        raise
    except Exception:
        # Log the error internally (in production, use proper logging)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An internal error occurred"
        )


@router.get("/s3-config", response_model=S3ConfigResponse)
def get_s3_config(db: Session = Depends(get_db)):
    """Get current S3 configuration (without secrets) - returns first active config."""
    config = db.query(StorageConfig).filter(StorageConfig.is_active == True).first()
    
    if not config:
        return S3ConfigResponse(
            configured=False,
            endpoint_url=None,
            region="us-east-1",
            use_ssl=True,
            has_credentials=False
        )
    
    return S3ConfigResponse(
        configured=bool(config.endpoint_url or config.aws_access_key_id),
        endpoint_url=config.endpoint_url,
        region=config.region_name,
        use_ssl=config.use_ssl,
        has_credentials=bool(config.aws_access_key_id)
    )


@router.put("/s3-config")
def update_s3_config(
    endpoint_url: Optional[str] = None,
    access_key: Optional[str] = None,
    secret_key: Optional[str] = None,
    region: str = "us-east-1",
    use_ssl: bool = True,
    verify_ssl: bool = True,
    db: Session = Depends(get_db)
):
    """Update S3 configuration (updates the default/first active config)."""
    try:
        # Test connection first
        # Use non-cached version for config updates to test the actual new connection
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
        
        # Update config - find default first, then first active
        config = db.query(StorageConfig).filter(StorageConfig.is_active == True).first()
        if not config:
            config = db.query(StorageConfig).filter(StorageConfig.is_active == True).first()
        
        if not config:
            # Create new config if none exists
            config = StorageConfig(
                name="Default Storage",
                is_active=True,
                is_default=True
            )
            db.add(config)
        
        config.endpoint_url = endpoint_url
        config.aws_access_key_id = access_key
        config.aws_secret_access_key = secret_key
        config.region_name = region
        config.use_ssl = use_ssl
        config.verify_ssl = verify_ssl
        
        db.commit()
        
        return {
            "success": True,
            "message": "S3 configuration updated successfully"
        }
    except HTTPException:
        raise
    except Exception:
        # Log the error internally (in production, use proper logging)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An internal error occurred"
        )


@router.get("/app-config", response_model=AppConfigResponse)
def get_app_config(db: Session = Depends(get_db)):
    """Get application configuration (heading text and logo)."""
    config = db.query(AppConfig).first()
    
    if not config:
        return AppConfigResponse(
            heading_text="S3 Manager",
            logo_url=None
        )
    
    return AppConfigResponse(
        heading_text=config.heading_text or "S3 Manager",
        logo_url=config.logo_url
    )
