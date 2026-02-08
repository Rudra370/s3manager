#!/bin/bash
# Local CI test script - simulates GitHub Actions workflow

set -e

echo "🧪 Simulating GitHub Actions CI environment..."
echo "================================================"

# Step 1: Clean start
echo "📦 Step 1: Clean start"
make stop 2>/dev/null || true
docker volume rm s3manager_minio_data 2>/dev/null || true

# Step 2: Create CI environment file
echo "🔧 Step 2: Creating CI environment"
cp .env.example .env.local.ci
cat >> .env.local.ci << 'ENVEOF'
SECRET_KEY=local-ci-test-secret-key-not-for-production
DEBUG=false

# Test users
TEST_ADMIN_NAME=CI Test Admin
TEST_ADMIN_EMAIL=admin@example.com
TEST_ADMIN_PASSWORD=SecurePassword123!
TEST_TEAM_MEMBER_NAME=CI Team Member
TEST_TEAM_MEMBER_EMAIL=team@example.com
TEST_TEAM_MEMBER_PASSWORD=TeamPass123!

# MinIO settings
MINIO_PORT=9000
TEST_STORAGE_NAME=MinIO CI Test
TEST_STORAGE_ENDPOINT=localhost:9000
TEST_STORAGE_ACCESS_KEY=minioadmin
TEST_STORAGE_SECRET_KEY=minioadmin
TEST_STORAGE_REGION=us-east-1
TEST_STORAGE_USE_SSL=false
TEST_STORAGE_VERIFY_SSL=false

TEST_APP_HEADING=S3 Manager CI Test
TEST_BUCKET_PREFIX=ci-test
ENVEOF

# Step 3: Build frontend
echo "🏗️  Step 3: Building frontend"
cd frontend
npm ci
npm run build
cd ..
mkdir -p backend/app/static
cp -r frontend/dist/* backend/app/static/

# Step 4: Start services
echo "🚀 Step 4: Starting services"
MINIO_PORT=9000 docker-compose -f docker-compose.yml -f docker-compose.dev.yml up -d

# Step 5: Wait for health
echo "⏳ Step 5: Waiting for services..."
sleep 20

# Health checks
echo "🏥 Step 6: Health checks"
curl -sf http://localhost:9000/minio/health/live && echo "✅ MinIO healthy" || (echo "❌ MinIO failed" && exit 1)
curl -sf http://localhost:3012/api/health && echo "✅ API healthy" || (echo "❌ API failed" && exit 1)

# Step 6: Run tests
echo "🧪 Step 7: Running E2E tests"
cd e2e
python3 test_runner.py

echo ""
echo "================================================"
echo "✅ CI simulation complete!"
