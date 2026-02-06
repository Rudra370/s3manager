#!/usr/bin/env python3
"""
Database utility for E2E testing with PostgreSQL.

This module handles:
- Creating isolated test databases for each test run via docker exec
- Dropping test databases after tests complete
- Waiting for PostgreSQL to be ready
"""

import os
import time
import subprocess
from datetime import datetime
from typing import Optional


class TestDatabaseManager:
    """Manages test database lifecycle for E2E testing."""
    
    def __init__(self):
        self.container = os.getenv('POSTGRES_CONTAINER', 's3manager-postgres')
        self.user = os.getenv('POSTGRES_USER', 's3manager')
        self.password = os.getenv('POSTGRES_PASSWORD', 's3manager')
        self.db = os.getenv('POSTGRES_DB', 's3manager')
        
        self.test_db_name: Optional[str] = None
    
    def _run_psql(self, command: str, database: Optional[str] = None) -> tuple:
        """Run psql command inside the PostgreSQL container."""
        db = database or self.db
        
        # Build docker exec command
        docker_cmd = [
            'docker', 'exec', '-i',
            '-e', f'PGPASSWORD={self.password}',
            self.container,
            'psql',
            '-U', self.user,
            '-d', db,
            '-c', command
        ]
        
        result = subprocess.run(
            docker_cmd,
            capture_output=True,
            text=True
        )
        
        return result.returncode, result.stdout, result.stderr
    
    def wait_for_postgres(self, timeout: int = 60) -> bool:
        """Wait for PostgreSQL to be ready using docker exec."""
        start_time = time.time()
        while time.time() - start_time < timeout:
            try:
                # Use pg_isready via docker exec
                result = subprocess.run(
                    ['docker', 'exec', self.container, 'pg_isready', '-U', self.user],
                    capture_output=True,
                    text=True,
                    timeout=5
                )
                if result.returncode == 0:
                    return True
            except (subprocess.TimeoutExpired, subprocess.CalledProcessError):
                pass
            time.sleep(1)
        return False
    
    def create_test_database(self) -> str:
        """Create a new test database and return its name."""
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        self.test_db_name = f"s3manager_test_{timestamp}"
        
        # Create database using psql via docker exec
        returncode, stdout, stderr = self._run_psql(f'CREATE DATABASE "{self.test_db_name}"')
        
        if returncode != 0:
            raise RuntimeError(f"Failed to create test database: {stderr}")
        
        print(f"✓ Created test database: {self.test_db_name}")
        return self.test_db_name
    
    def drop_test_database(self) -> None:
        """Drop the test database."""
        if not self.test_db_name:
            return
        
        # Terminate connections and drop database
        commands = [
            f"SELECT pg_terminate_backend(pg_stat_activity.pid) FROM pg_stat_activity WHERE pg_stat_activity.datname = '{self.test_db_name}' AND pid <> pg_backend_pid();",
            f'DROP DATABASE IF EXISTS "{self.test_db_name}"'
        ]
        
        for cmd in commands:
            returncode, stdout, stderr = self._run_psql(cmd)
            # Ignore errors for connection termination, but report drop errors
            if 'DROP DATABASE' in cmd and returncode != 0:
                print(f"⚠ Warning: Failed to drop test database: {stderr}")
                return
        
        print(f"✓ Dropped test database: {self.test_db_name}")
    
    def get_database_url(self) -> str:
        """Get the DATABASE_URL for the test database."""
        if not self.test_db_name:
            raise RuntimeError("Test database not created yet")
        # Use internal container network address
        return f"postgresql://{self.user}:{self.password}@postgres:5432/{self.test_db_name}"


# Global instance for test runner
db_manager = TestDatabaseManager()


def wait_for_postgres(timeout: int = 60) -> bool:
    """Wait for PostgreSQL to be ready."""
    return db_manager.wait_for_postgres(timeout)


def create_test_database() -> str:
    """Create a test database and return its name."""
    return db_manager.create_test_database()


def drop_test_database() -> None:
    """Drop the test database."""
    db_manager.drop_test_database()


def get_test_database_url() -> str:
    """Get the DATABASE_URL for the test database."""
    return db_manager.get_database_url()
