---
name: s3manager-git-workflow
description: MANDATORY git workflow for S3 Manager project. Triggers when asked to implement features, fix bugs, refactor code, make changes, or write tests. ENFORCES critical rules that must NEVER be violated.
---

# S3 Manager Git Workflow

This skill contains CRITICAL rules that MUST be followed for any code changes to the S3 Manager project.

## ⚠️ CRITICAL RULES - NEVER VIOLATE

### Rule 1: ALWAYS Work on `dev` Branch
```bash
# Before making ANY code changes, run:
git checkout dev

# If dev doesn't exist:
git checkout -b dev
```
- **NEVER** commit directly to `main`
- **NEVER** create branches from `main`
- **NEVER** merge to `main` — the user handles this manually

### Rule 2: NEVER Commit Without Explicit Permission
- **ALWAYS ask**: "Should I commit these changes?"
- Wait for explicit "yes" or "commit them" before running `git commit`
- Do NOT use `git add -f` for gitignored files
- The user handles commits and pushes

### Rule 3: E2E Test-First Workflow (MANDATORY)
For ANY new feature or bug fix:

1. **Write E2E test FIRST** — before touching implementation code
   - Tests are in `/e2e/test_runner.py`
   - Add test method to `S3ManagerE2ETests` class

2. **Run test (expect failure)**
   ```bash
   cd /root/code/s3manager/e2e && python3 test_runner.py
   ```

3. **Implement the fix/feature**

4. **Run test again (expect success)**
   ```bash
   cd /root/code/s3manager/e2e && python3 test_runner.py
   ```

5. **Ask permission to commit**

## Workflow Checklist

Before starting any code change:
- [ ] `git checkout dev` — on dev branch
- [ ] Write E2E test first (if feature/fix)
- [ ] Run test — confirm it fails
- [ ] Implement change
- [ ] Run test — confirm it passes
- [ ] Ask user: "Should I commit these changes?"

## Trigger Phrases

This skill activates when user says things like:
- "Fix this bug"
- "Implement feature X"
- "Add Y functionality"
- "Refactor Z"
- "Write a test for..."
- "Update the code to..."
- Any request involving code changes

## Quick Commands

```bash
# Check current branch
git branch --show-current

# Checkout dev (or create if missing)
git checkout dev 2>/dev/null || git checkout -b dev

# Run E2E tests
cd /root/code/s3manager/e2e && python3 test_runner.py

# Run fast E2E tests (truncate DB, ~10s faster)
make test-fast
```

## Project Context

- **Backend**: FastAPI + SQLAlchemy + PostgreSQL
- **Frontend**: React + Material-UI + Vite
- **Tests**: Playwright E2E tests in `/e2e/`
- **Default S3**: MinIO (no AWS credentials needed for testing)
- **Working directory**: `/root/code/s3manager`

## Reminder

**STOP and CHECK**: Am I on `dev` branch? Have I asked permission before committing?

If the user explicitly says "commit this" or "commit these changes" — then commit. Otherwise, ask first.
