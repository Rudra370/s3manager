"""Background tasks for share links."""

import logging
from celery import shared_task
from .base import ProgressTask
from ..database import SessionLocal
from ..models import SharedLink

logger = logging.getLogger(__name__)


@shared_task(bind=True, base=ProgressTask, max_retries=3)
def delete_share_task(self, share_id: int):
    """Delete a share link in the background."""
    try:
        db = SessionLocal()
        try:
            share = db.query(SharedLink).filter(SharedLink.id == share_id).first()
            if share:
                db.delete(share)
                db.commit()
                logger.info(f"Deleted share link {share_id}")
            else:
                logger.warning(f"Share link {share_id} not found for deletion")
        finally:
            db.close()
        
        self.set_complete({"deleted": True, "share_id": share_id})
        return {"status": "completed", "share_id": share_id}
        
    except Exception as e:
        logger.exception(f"Failed to delete share link {share_id}")
        self.set_failed(str(e))
        raise
