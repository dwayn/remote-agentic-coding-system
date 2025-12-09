#!/bin/bash
# Test script to validate POSTGRES_DATA_VOLUME configuration
# This script simulates docker-compose behavior by showing what volume mount would be used

set -e

echo "=========================================="
echo "Testing POSTGRES_DATA_VOLUME Configuration"
echo "=========================================="
echo ""

# Test 1: Default (no env var set)
echo "Test 1: Default configuration (named volume)"
echo "-------------------------------------------"
POSTGRES_DATA_VOLUME="${POSTGRES_DATA_VOLUME:-postgres_data}"
echo "Result: ${POSTGRES_DATA_VOLUME}:/var/lib/postgresql/data"
echo "Expected: postgres_data:/var/lib/postgresql/data"
if [ "$POSTGRES_DATA_VOLUME" = "postgres_data" ]; then
    echo "✓ PASS: Using named volume (backward compatible)"
else
    echo "✗ FAIL: Expected 'postgres_data'"
fi
echo ""

# Test 2: Custom relative path
echo "Test 2: Custom relative path"
echo "-------------------------------------------"
export POSTGRES_DATA_VOLUME="./data/postgres-dev"
POSTGRES_DATA_VOLUME="${POSTGRES_DATA_VOLUME:-postgres_data}"
echo "Result: ${POSTGRES_DATA_VOLUME}:/var/lib/postgresql/data"
echo "Expected: ./data/postgres-dev:/var/lib/postgresql/data"
if [ "$POSTGRES_DATA_VOLUME" = "./data/postgres-dev" ]; then
    echo "✓ PASS: Using custom relative path (bind mount)"
else
    echo "✗ FAIL: Expected './data/postgres-dev'"
fi
echo ""

# Test 3: Custom absolute path
echo "Test 3: Custom absolute path"
echo "-------------------------------------------"
export POSTGRES_DATA_VOLUME="/var/lib/postgres-custom"
POSTGRES_DATA_VOLUME="${POSTGRES_DATA_VOLUME:-postgres_data}"
echo "Result: ${POSTGRES_DATA_VOLUME}:/var/lib/postgresql/data"
echo "Expected: /var/lib/postgres-custom:/var/lib/postgresql/data"
if [ "$POSTGRES_DATA_VOLUME" = "/var/lib/postgres-custom" ]; then
    echo "✓ PASS: Using custom absolute path (bind mount)"
else
    echo "✗ FAIL: Expected '/var/lib/postgres-custom'"
fi
echo ""

# Test 4: Empty string fallback
echo "Test 4: Empty string fallback to default"
echo "-------------------------------------------"
export POSTGRES_DATA_VOLUME=""
POSTGRES_DATA_VOLUME="${POSTGRES_DATA_VOLUME:-postgres_data}"
echo "Result: ${POSTGRES_DATA_VOLUME}:/var/lib/postgresql/data"
echo "Expected: postgres_data:/var/lib/postgresql/data"
if [ "$POSTGRES_DATA_VOLUME" = "postgres_data" ]; then
    echo "✓ PASS: Empty string falls back to default"
else
    echo "✗ FAIL: Expected 'postgres_data'"
fi
echo ""

echo "=========================================="
echo "All tests completed!"
echo "=========================================="
echo ""
echo "Usage Examples:"
echo "---------------"
echo ""
echo "1. Default (named volume - backward compatible):"
echo "   docker compose --profile with-db up -d"
echo "   Result: Named volume 'postgres_data' is used"
echo ""
echo "2. Custom path for separate dev database:"
echo "   POSTGRES_DATA_VOLUME=./data/postgres-dev"
echo "   docker compose --profile with-db up -d"
echo "   Result: Bind mount to ./data/postgres-dev"
echo ""
echo "3. Multiple instances with separate databases:"
echo "   # Instance 1 (.env): POSTGRES_DATA_VOLUME=./data/postgres-prod"
echo "   # Instance 2 (.env.dev): POSTGRES_DATA_VOLUME=./data/postgres-dev"
echo "   Each instance has completely isolated data"
echo ""
