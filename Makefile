.PHONY: test test-unit test-integration

# Run every test block (backend unit, backend integration, frontend).
test:
	./scripts/test.sh

test-unit:
	cd backend && uv run pytest -m unit

test-integration:
	cd backend && uv run pytest -m integration
