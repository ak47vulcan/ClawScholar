#!/usr/bin/env bash
# Checks that all ClawScholar services are healthy.
set -euo pipefail

GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

pass() { echo -e "${GREEN}✓${NC} $1"; }
fail() { echo -e "${RED}✗${NC} $1"; EXIT_CODE=1; }

EXIT_CODE=0

# Backend
if curl -sf http://localhost:8000/api/v1/health > /dev/null 2>&1; then
  pass "Backend (FastAPI) is healthy"
else
  fail "Backend (FastAPI) is not reachable at :8000"
fi

# Frontend
if curl -sf http://localhost:3000 > /dev/null 2>&1; then
  pass "Frontend (Next.js) is healthy"
else
  fail "Frontend (Next.js) is not reachable at :3000"
fi

# Postgres
if docker compose exec -T postgres pg_isready -U clawscholar > /dev/null 2>&1; then
  pass "PostgreSQL is ready"
else
  fail "PostgreSQL is not ready"
fi

# Redis
if docker compose exec -T redis redis-cli ping | grep -q PONG; then
  pass "Redis is ready"
else
  fail "Redis is not ready"
fi

exit $EXIT_CODE
