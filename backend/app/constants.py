"""
Application Constants

All magic numbers and configuration defaults should be defined here.
"""

# ============================================================================
# Multipart Upload Settings
# ============================================================================

# File size threshold for using multipart upload (100 MB)
MULTIPART_THRESHOLD = 100 * 1024 * 1024  # 100 MB in bytes

# Size of each part in multipart upload (10 MB)
# AWS S3 requires each part (except last) to be at least 5 MB, max 5 GB
MULTIPART_CHUNK_SIZE = 10 * 1024 * 1024  # 10 MB in bytes

# Maximum number of parts allowed in multipart upload
# AWS S3 allows maximum 10,000 parts per upload
MULTIPART_MAX_PARTS = 10000

# Maximum concurrent uploads for multipart
MULTIPART_MAX_CONCURRENT = 3

# ============================================================================
# Pagination Settings
# ============================================================================

# Default page size for object listing
DEFAULT_PAGE_SIZE = 100

# Maximum page size for object listing
MAX_PAGE_SIZE = 1000

# ============================================================================
# Download Settings
# ============================================================================

# Chunk size for streaming downloads (8 KB)
DOWNLOAD_CHUNK_SIZE = 8192

# ============================================================================
# Task Progress Settings
# ============================================================================

# Task progress TTL in seconds (30 minutes)
TASK_PROGRESS_TTL = 30 * 60

# ============================================================================
# Cookie Settings
# ============================================================================

# Cookie expiration in seconds (7 days)
COOKIE_EXPIRATION_DAYS = 7
COOKIE_EXPIRATION_SECONDS = COOKIE_EXPIRATION_DAYS * 24 * 60 * 60
