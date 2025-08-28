# Repository Guidelines

> This repo currently has no committed code. These guidelines establish defaults so new modules, tooling, and tests land consistently from day one.

## Project Structure & Module Organization

- `src/`: application/library code (feature-first or domain folders)
- `tests/`: mirrors `src/` structure for unit/integration tests
- `scripts/`: one-off automation and local tooling
- `public/` or `assets/`: static files (images, fonts, fixtures)
- `.github/workflows/`: CI pipelines
- `docs/`: architecture notes and ADRs

Example: `src/auth/`, `src/http/`, `tests/auth/`, `tests/http/`.

## Build, Test, and Development Commands

Prefer Makefile shims; add equivalents if using other tooling.

- Setup: `make setup` — install dependencies and pre-commit hooks
- Dev: `make dev` — start local server or watch mode
- Test: `make test` — run unit/integration tests
- Lint: `make lint` — static analysis
- Format: `make format` — auto-apply style rules
- Build: `make build` — produce distributable artifacts

If Make is not used, provide `npm run <task>` or `uv run`/`pytest` equivalents.

## Coding Style & Naming Conventions

- Indentation: 2 spaces (JS/TS), 4 spaces (Python)
- Line length: 100 (JS/TS), 88 (Python)
- Tools: JS/TS → Prettier + ESLint; Python → Black + Ruff
- Filenames: kebab-case for web assets, snake_case for Python modules; tests mirror source names
- APIs: prefer explicit exports; avoid default exports in TS

## Testing Guidelines

- Frameworks: Jest/Vitest (JS/TS) or Pytest (Python)
- Coverage: target ≥ 80% lines; include critical paths
- Naming: `tests/<area>/test_<module>.py` or `tests/<area>/<module>.spec.ts`
- Run: `make test` (or `npm test` / `pytest -q`)

## Commit & Pull Request Guidelines

- Commits: follow Conventional Commits, e.g., `feat: add OAuth flow`, `fix(http): handle 429`
- Scope small and atomic; include rationale in body
- PRs: clear description, linked issues, screenshots for UI, reproduction/verification steps
- Checks: ensure `make lint test build` pass and update docs when behavior changes

## Security & Configuration Tips

- Never commit secrets; use `.env` and provide `.env.example`
- Validate inputs at boundaries; log without PII
- Lock dependencies and run CI on PRs from forks with restricted tokens

## Agent-Specific Instructions

- Keep changes minimal and focused; avoid sweeping refactors
- Update this file and README when adding tooling or commands
- Include a short plan in PR description and note any trade-offs
