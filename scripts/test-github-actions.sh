#!/bin/bash
# Test the GitHub Actions workflow locally in a clean environment

set -e

echo "=== Simulating GitHub Actions environment ==="
echo

# Clean start
echo "1. Cleaning up..."
rm -rf frontend/dist backend/app/static

# Simulate the build step
echo
echo "2. Building frontend (like GitHub Actions)..."
cd frontend
npm ci
npm run build

# Check if dist exists
echo
echo "3. Checking dist directory..."
if [ ! -d "dist" ]; then
    echo "ERROR: dist not found!"
    exit 1
fi
ls -la dist/

# Copy step (from root)
echo
echo "4. Copying to backend..."
cd ..
mkdir -p backend/app/static
cp -r frontend/dist/* backend/app/static/
ls -la backend/app/static/

echo
echo "✅ Success! Frontend build copied correctly."
