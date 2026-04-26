#!/usr/bin/env bash
# Generates TypeScript types from the FastAPI OpenAPI schema.
# Requires: npx openapi-typescript (npm i -g openapi-typescript)
set -euo pipefail

BACKEND_URL="${NEXT_PUBLIC_API_URL:-http://localhost:8000/api/v1}"
OUTPUT="frontend/src/types/generated-api.ts"

echo "Fetching OpenAPI schema from ${BACKEND_URL}/openapi.json ..."
npx openapi-typescript "${BACKEND_URL}/openapi.json" --output "${OUTPUT}"
echo "✓ Types written to ${OUTPUT}"
