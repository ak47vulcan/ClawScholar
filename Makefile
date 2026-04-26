.PHONY: up down build logs migrate seed test lint format shell-backend shell-frontend health

up:
	docker compose up -d

down:
	docker compose down

build:
	docker compose build

logs:
	docker compose logs -f

logs-backend:
	docker compose logs -f backend

logs-frontend:
	docker compose logs -f frontend

migrate:
	docker compose exec backend alembic upgrade head

migrate-create:
	docker compose exec backend alembic revision --autogenerate -m "$(name)"

seed:
	docker compose exec backend python scripts/seed_db.py

test:
	docker compose exec backend pytest tests/ -v

test-backend:
	docker compose exec backend pytest tests/ -v --tb=short

lint:
	docker compose exec backend ruff check app/
	docker compose exec backend mypy app/

format:
	docker compose exec backend ruff format app/
	docker compose exec backend ruff check --fix app/

shell-backend:
	docker compose exec backend bash

shell-frontend:
	docker compose exec frontend sh

health:
	@curl -s http://localhost:8000/api/v1/health | python3 -m json.tool
	@echo "Frontend: $$(curl -s -o /dev/null -w '%{http_code}' http://localhost:3000)"

reset-db:
	docker compose down -v
	docker compose up -d postgres redis
	sleep 3
	$(MAKE) migrate
	$(MAKE) seed
