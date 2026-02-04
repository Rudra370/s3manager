# S3 Manager - End-to-End Tests

Comprehensive E2E test suite using Python + Playwright. Tests the entire application flow from setup wizard to permission management.

## Features

- ✅ **Single command execution** - `python3 test_runner.py`
- ✅ **Automatic environment management** - Resets DB, restarts Docker
- ✅ **Headless browser** - Runs without GUI
- ✅ **Screenshots on failure** - Captures page state
- ✅ **Video recording** - Records test execution
- ✅ **Always cleans up** - Stops services even if tests fail
- ✅ **Stops on first failure** - Fast feedback

## Prerequisites

1. **Docker & Docker Compose** installed
2. **Python 3.8+** installed
3. **Playwright browsers** installed

## Installation

```bash
cd e2e

# Install Python dependencies
pip3 install -r requirements.txt

# Install Playwright browsers (only chromium needed)
playwright install chromium
```

## Configuration

1. Copy `.env.example` to `.env` in the project root:
```bash
cp ../.env.example ../.env
```

2. Edit `.env` and fill in your **Hetzner S3 credentials**:
```bash
# Required: Admin user
TEST_ADMIN_EMAIL=admin@yourdomain.com
TEST_ADMIN_PASSWORD=YourSecurePassword123!

# Required: Hetzner S3 credentials
TEST_STORAGE_ENDPOINT=hel1.your-objectstorage.com
TEST_STORAGE_ACCESS_KEY=your-access-key
TEST_STORAGE_SECRET_KEY=your-secret-key

# Required: Team member for permission testing
TEST_TEAM_MEMBER_EMAIL=team@yourdomain.com
TEST_TEAM_MEMBER_PASSWORD=TeamPass123!

# Optional: Protected buckets (never touched during tests)
TEST_PROTECTED_BUCKETS=gtk,production-data
```

## Usage

### Run All Tests
```bash
python3 test_runner.py
```

### What Happens

1. **Environment Reset**
   - Stops Docker containers
   - Deletes SQLite database (`data/s3manager.db`)
   - Starts fresh services
   - Waits for health check

2. **Test Execution** (Headless)
   - Setup Wizard (3 steps)
   - Admin Login/Logout
   - Bucket Management
   - Object Operations (upload, download, delete)
   - User Management
   - Permission Management
   - Team Member Access Control
   - Share Links
   - Storage Configuration
   - Edge Cases & Error Handling
   - Theme Toggle

3. **Cleanup** (Always runs)
   - Deletes test buckets (except protected ones)
   - Deletes test users
   - Stops Docker services

## Test Results

After execution, check:

```
e2e/
├── test_results/          # Screenshots on failure
│   └── failed_test_name_20240115_143022.png
└── test_videos/           # Video recordings
    └── test-video-*.webm
```

## Protected Buckets

Buckets listed in `TEST_PROTECTED_BUCKETS` are **never touched** during tests:
- Not deleted during cleanup
- Not modified during tests
- Completely excluded from all operations

## Exit Codes

- `0` - All tests passed
- `1` - One or more tests failed

## Debugging Failed Tests

1. **Check screenshots**: `test_results/failed_*.png`
2. **Watch video**: `test_videos/*.webm`
3. **View logs**: 
   ```bash
   cd ..
   docker-compose logs s3manager
   ```
4. **Run with visible browser** (modify `test_runner.py`):
   ```python
   self.start_browser(headless=False)  # Line ~185
   ```

## Test Flow Details

| # | Test | Description |
|---|------|-------------|
| 1 | Setup Wizard | Completes 3-step setup with admin + S3 config |
| 2 | Admin Login | Tests login, logout, invalid credentials |
| 3 | Bucket Management | Create, size calc, delete buckets |
| 4 | Object Operations | Upload, download, folders, search, bulk delete |
| 5 | User Management | Create, edit, reset password, deactivate user |
| 6 | Permission Mgmt | Set storage + bucket-level permissions |
| 7 | Team Member Access | Verify permissions work correctly |
| 8 | Share Links | Create public + password-protected shares |
| 9 | Storage Configs | View, test connection |
| 10 | Edge Cases | Empty inputs, invalid login, errors |
| 11 | Theme Toggle | Dark/light mode |

## Troubleshooting

### "Services failed to start"
- Check if port 3012 is already in use
- Check Docker is running: `docker ps`
- View logs: `docker-compose logs`

### "Browser not found"
- Install Playwright browsers: `playwright install chromium`

### Tests fail on first run but pass later
- This is normal - first run creates caches
- Subsequent runs should be stable

## Architecture

```
test_runner.py (orchestrator)
├── Infrastructure (subprocess)
│   ├── docker-compose down/up
│   └── rm -f data/s3manager.db
├── Browser (Playwright)
│   ├── Headless Chromium
│   ├── Video recording
│   └── Screenshots
└── Cleanup (always runs)
    ├── API calls to delete buckets
    ├── API calls to delete users
    └── docker-compose down
```

## Security Notes

- Credentials stored only in `.env` (gitignored)
- Test runner never logs sensitive data
- Protected buckets cannot be deleted by tests
