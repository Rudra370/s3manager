"""
Celery configuration for background tasks
"""

import logging
import os
from celery import Celery
from celery.signals import beat_init

logger = logging.getLogger(__name__)

celery_app = Celery(
    "s3manager",
    broker=os.getenv("CELERY_BROKER_URL", "redis://localhost:6379/0"),
    backend=os.getenv("CELERY_RESULT_BACKEND", "redis://localhost:6379/0"),
    include=["app.tasks", "app.tasks.bucket_tasks"],
)

celery_app.conf.update(
    # Task settings
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    # Task execution
    task_track_started=True,
    task_time_limit=3600,  # 1 hour max per task
    # Result backend settings
    result_expires=86400,  # Results expire after 24 hours
    # Worker settings
    worker_prefetch_multiplier=1,
    worker_max_tasks_per_child=1000,
)

# Beat schedule for periodic tasks
celery_app.conf.beat_schedule = {
    "cleanup-expired-shares": {
        "task": "app.tasks.cleanup_expired_shares",
        "schedule": 3600.0,  # Run every hour
    },
}


@beat_init.connect
def on_beat_init(sender, **kwargs):
    """Initialize beat scheduler"""
    logger.info("Celery beat scheduler initialized")


def init_celery():
    """Initialize celery with Flask/FastAPI app context if needed"""
    return celery_app
