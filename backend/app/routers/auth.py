import logging
import os
from fastapi import APIRouter, Depends, HTTPException, status, Response
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import User
from app.schemas import UserLogin, UserProfileResponse
from app.auth import verify_password, create_access_token, get_current_active_user

router = APIRouter(prefix="/api/auth", tags=["auth"])
logger = logging.getLogger(__name__)

# Constants
COOKIE_MAX_AGE = 7 * 24 * 60 * 60  # 7 days


@router.post("/login")
def login(response: Response, credentials: UserLogin, db: Session = Depends(get_db)):
    """Authenticate user and return JWT token via cookie."""
    logger.info(
        f"Login attempt: email={credentials.email}",
        extra={"operation": "login", "email": credentials.email}
    )
    
    # Find user by email
    user = db.query(User).filter(User.email == credentials.email).first()
    
    if not user:
        logger.warning(
            f"Login failed: user not found, email={credentials.email}",
            extra={"operation": "login", "email": credentials.email, "error_type": "user_not_found"}
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    # Check if user is active
    if not user.is_active:
        logger.warning(
            f"Login failed: account deactivated, user_id={user.id}, email={credentials.email}",
            extra={"operation": "login", "user_id": user.id, "email": credentials.email, "error_type": "account_deactivated"}
        )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account is deactivated. Please contact an administrator.",
        )
    
    # Verify password (never log the password)
    if not verify_password(credentials.password, user.hashed_password):
        logger.warning(
            f"Login failed: invalid password, user_id={user.id}, email={credentials.email}",
            extra={"operation": "login", "user_id": user.id, "email": credentials.email, "error_type": "invalid_password"}
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    # Create access token
    access_token = create_access_token(data={"sub": user.email})
    
    # Set cookie
    response.set_cookie(
        key="access_token",
        value=access_token,
        httponly=True,
        secure=os.getenv("COOKIE_SECURE", "false").lower() == "true",
        samesite="lax",
        max_age=COOKIE_MAX_AGE,
    )
    
    logger.info(
        f"Login successful: user_id={user.id}, email={credentials.email}, is_admin={user.is_admin}",
        extra={"operation": "login", "user_id": user.id, "email": credentials.email, "is_admin": user.is_admin}
    )
    
    return {
        "access_token": access_token,
        "token_type": "bearer"
    }


@router.post("/logout")
def logout(response: Response):
    """Logout user by clearing the cookie."""
    response.delete_cookie(key="access_token")
    logger.info("Logout successful", extra={"operation": "logout"})
    return {"success": True, "message": "Logged out successfully"}


@router.get("/me", response_model=UserProfileResponse)
def get_me(current_user: User = Depends(get_current_active_user)):
    """Get current user profile."""
    return {
        "id": current_user.id,
        "name": current_user.name,
        "email": current_user.email,
        "is_admin": current_user.is_admin,
        "is_active": current_user.is_active,
        "created_at": current_user.created_at.isoformat() if current_user.created_at else None
    }
