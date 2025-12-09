#!/bin/bash

echo "Testing Docker volume behavior..."
echo ""

# Test 1: Default (named volume)
echo "=== Test 1: Default (uses named volume) ==="
echo "POSTGRES_DATA_VOLUME=postgres_data" > .env.voltest1
docker compose --env-file .env.voltest1 --profile with-db config 2>/dev/null | grep -A 3 "volumes:" | tail -4

# Test 2: Custom path (bind mount)
echo ""
echo "=== Test 2: Custom path (uses bind mount) ==="
echo "POSTGRES_DATA_VOLUME=./data/postgres-custom" > .env.voltest2
docker compose --env-file .env.voltest2 --profile with-db config 2>/dev/null | grep -A 3 "volumes:" | tail -4

# Test 3: Check if named volume definition causes issues
echo ""
echo "=== Test 3: Checking root volumes definition ==="
docker compose --env-file .env.voltest2 --profile with-db config 2>/dev/null | grep -A 2 "^volumes:"

# Cleanup
rm .env.voltest1 .env.voltest2

