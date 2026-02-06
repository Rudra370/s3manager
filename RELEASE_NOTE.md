# Version 0.0.1 — PostgreSQL Migration & Enhanced Error Handling

## Overview

Major release migrating from SQLite to PostgreSQL for production-grade reliability. Adds error traceback modal and expands E2E test coverage.

**Breaking Change**: Requires fresh setup. No automatic migration from SQLite.

---

## What's New

### PostgreSQL Support
- Migrated from SQLite to PostgreSQL 16
- Added Alembic for database migrations
- New PostgreSQL service in Docker Compose
- Database access via docker exec (port not exposed for security)

### Error Traceback Modal
- Global error handler displaying detailed 500 error tracebacks
- Copy-to-clipboard functionality
- Scrollable monospace display

### Expanded E2E Tests
Added 7 new tests (25 total):
- Public Share Access
- Password-Protected Share
- User Deletion
- Storage Config Delete
- Folder Size Calculation
- Protected Buckets
- File Preview

---

## Bug Fixes

- Fixed enum handling for PostgreSQL (UserRole, StoragePermission, BucketPermission)
- Fixed datetime comparison errors in share links
- Fixed permission API for PostgreSQL string values

---

## Improvements

**Backend**
- Global exception handler returning full tracebacks for 500 errors
- Timezone-aware datetime operations

**Frontend**
- API interceptor catching 500 errors
- ErrorContext for state management

**Infrastructure**
- setup.sh updated for PostgreSQL configuration

**Testing**
- E2E uses docker exec for database operations
- Per-test cleanup with finally blocks
- API-based bucket cleanup

---

## Migration Guide

1. Backup existing SQLite data if needed
2. Update `.env`:
   ```
   DATABASE_URL=postgresql://s3manager:s3manager@postgres:5432/s3manager
   ```
3. Run `./setup.sh`
4. Re-configure via setup wizard

No automatic migration provided. In future updates there will be automatic migration scripts, this release requires a fresh setup due to database changes.

---

## Technical Details

**New Dependencies**
- psycopg2-binary>=2.9.9
- alembic>=1.12.0

**Schema Changes**
- User.role: PostgreSQL ENUM
- UserStoragePermission.permission: PostgreSQL ENUM
- UserBucketPermission.permission: PostgreSQL ENUM

---

## Developer Experience

Added tooling for faster development:

- **Makefile** — Common commands (`make dev`, `make test`, `make logs`)
- **Environment Config** — Separate `.env.local` for local overrides
- **Hot Reload** — `make dev-hot` for auto-restart on code changes
- **Fast Tests** — `make test-fast` truncates DB instead of recreating
- **Dev Scripts** — `scripts/dev-start.sh`, `scripts/dev-reset.sh`
- **Debug Mode** — `DEBUG=true` enables auto-reload and debug endpoints

---

Released: February 2026
