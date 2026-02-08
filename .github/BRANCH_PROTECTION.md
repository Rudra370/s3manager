# Branch Protection Setup Guide

This guide explains how to enable branch protection for the S3 Manager repository.

## What is Branch Protection?

Branch protection rules enforce certain workflows for branches, such as:
- Requiring pull request reviews before merging
- Requiring status checks to pass before merging
- Preventing force pushes
- Preventing deletion

## Setup Steps

### 1. Go to Repository Settings

Navigate to: `https://github.com/Rudra370/s3manager/settings/branches`

### 2. Add Rule for `main` Branch

Click **"Add rule"** and configure:

#### Branch name pattern
```
main
```

#### Protect matching branches

✅ **Require a pull request before merging**
- Required approvals: `1`
- ✅ Dismiss stale PR approvals when new commits are pushed
- ✅ Require review from code owners (optional)

✅ **Require status checks to pass before merging**
- Search for and select: `e2e-tests` (or your job name)
- ✅ Require branches to be up to date before merging

✅ **Restrict pushes that create files larger than 100MB**

✅ **Require linear history** (optional, prevents merge commits)

### 3. Add Rule for `dev` Branch (Optional)

Click **"Add rule"** again:

#### Branch name pattern
```
dev
```

#### Protect matching branches

✅ **Require a pull request before merging**
- Required approvals: `1` (or `0` for faster dev workflow)

✅ **Require status checks to pass before merging**
- Search for and select: `e2e-tests`

✅ **Restrict pushes that create files larger than 100MB**

### 4. Enable Actions Permissions

Go to: `https://github.com/Rudra370/s3manager/settings/actions`

#### Actions permissions
- ✅ **Allow all actions and reusable workflows** (or restrict as needed)

#### Workflow permissions
- ✅ **Read and write permissions** (for artifact uploads)

### 5. Verify CI is Running

After pushing the workflow files:

1. Go to: `https://github.com/Rudra370/s3manager/actions`
2. You should see the "E2E Tests" workflow
3. Push a test commit to trigger it

## Current CI Status

The CI workflow:
- ✅ Builds frontend
- ✅ Starts MinIO (local S3-compatible storage)
- ✅ Runs full E2E test suite
- ✅ No AWS credentials needed!

**Note:** Some UI tests may have pre-existing issues. The critical MinIO integration tests pass.

## Troubleshooting

### Workflow not triggering?
- Check that `.github/workflows/test.yml` exists in the default branch
- Verify Actions are enabled in repository settings

### Status check not appearing?
- The workflow must run at least once before it appears in branch protection
- Push a commit to trigger it

### Artifacts not uploading?
- Check workflow permissions (need write access)
- Check artifact path in workflow file

## Recommended Workflow

1. Create feature branch from `dev`
2. Make changes, commit, push
3. Create PR to `dev`
4. CI runs automatically
5. Review and merge to `dev`
6. Create PR from `dev` to `main`
7. CI runs again
8. Review and merge to `main`
