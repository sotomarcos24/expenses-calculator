# Semgrep findings

Deterministic static-analysis report for rubric criterion 13 (M9, issue #64). Semgrep OSS only: no account, login or token.

## How it was run

Image `semgrep/semgrep:1.100.0` (the same version CI uses), run from the repository root on 2026-10-20:

```bash
docker run --rm --user $(id -u):$(id -g) -e HOME=/tmp -v "$PWD:/src" -w /src semgrep/semgrep:1.100.0 \
  semgrep scan --metrics=off \
  --config p/python --config p/typescript --config p/dockerfile --config p/github-actions \
  --exclude node_modules --exclude .venv --exclude package-lock.json --exclude uv.lock \
  --exclude schema.d.ts --exclude openapi.json \
  --json --json-output security-audit/runs/2026-10-20-semgrep-local.json
```

The gate (CI job `semgrep`) adds `--severity ERROR --error`, which exits non-zero only on ERROR findings. Raw output: [`runs/2026-10-20-semgrep-local.json`](runs/2026-10-20-semgrep-local.json). Code snippets are not stored in the JSON (Semgrep shows `requires login` for them).

## Result

- 89 rules on 175 files: **0 ERROR findings** (the gate passes), **10 WARNING findings**, 0 INFO.
- No findings in Python, TypeScript or the Dockerfile; all 10 are in the GitHub Actions workflow.
- Parsing note: `frontend/src/pages/SimulatorPage.test.tsx` is only partially parsed (Semgrep does not understand `satisfies`); it is a test file, not application code.
- Scan limited to git-tracked files; Semgrep's default `.semgrepignore` skipped 38 tracked files (not listed by the tool without `--verbose`).

## Findings

| Finding (rule id) | Severity | File:line | Description | Proposed disposition | Human decision |
|---|---|---|---|---|---|
| `yaml.github-actions.security.github-actions-mutable-action-tag.github-actions-mutable-action-tag` | WARNING | `.github/workflows/ci.yml:15` | `actions/checkout@v4` uses a mutable tag, which the action owner can repoint. | Accept: first-party/well-known actions pinned to a major tag, WARNING only; pinning to commit SHAs (with Dependabot updates) is optional hardening. | pending |
| `yaml.github-actions.security.github-actions-mutable-action-tag.github-actions-mutable-action-tag` | WARNING | `.github/workflows/ci.yml:16` | `astral-sh/setup-uv@v6` uses a mutable tag, which the action owner can repoint. | Accept: first-party/well-known actions pinned to a major tag, WARNING only; pinning to commit SHAs (with Dependabot updates) is optional hardening. | pending |
| `yaml.github-actions.security.github-actions-mutable-action-tag.github-actions-mutable-action-tag` | WARNING | `.github/workflows/ci.yml:33` | `actions/checkout@v4` uses a mutable tag, which the action owner can repoint. | Accept: first-party/well-known actions pinned to a major tag, WARNING only; pinning to commit SHAs (with Dependabot updates) is optional hardening. | pending |
| `yaml.github-actions.security.github-actions-mutable-action-tag.github-actions-mutable-action-tag` | WARNING | `.github/workflows/ci.yml:43` | `actions/checkout@v4` uses a mutable tag, which the action owner can repoint. | Accept: first-party/well-known actions pinned to a major tag, WARNING only; pinning to commit SHAs (with Dependabot updates) is optional hardening. | pending |
| `yaml.github-actions.security.github-actions-mutable-action-tag.github-actions-mutable-action-tag` | WARNING | `.github/workflows/ci.yml:44` | `actions/setup-node@v4` uses a mutable tag, which the action owner can repoint. | Accept: first-party/well-known actions pinned to a major tag, WARNING only; pinning to commit SHAs (with Dependabot updates) is optional hardening. | pending |
| `yaml.github-actions.security.github-actions-mutable-action-tag.github-actions-mutable-action-tag` | WARNING | `.github/workflows/ci.yml:86` | `actions/checkout@v4` uses a mutable tag, which the action owner can repoint. | Accept: first-party/well-known actions pinned to a major tag, WARNING only; pinning to commit SHAs (with Dependabot updates) is optional hardening. | pending |
| `yaml.github-actions.security.github-actions-mutable-action-tag.github-actions-mutable-action-tag` | WARNING | `.github/workflows/ci.yml:87` | `astral-sh/setup-uv@v6` uses a mutable tag, which the action owner can repoint. | Accept: first-party/well-known actions pinned to a major tag, WARNING only; pinning to commit SHAs (with Dependabot updates) is optional hardening. | pending |
| `yaml.github-actions.security.github-actions-mutable-action-tag.github-actions-mutable-action-tag` | WARNING | `.github/workflows/ci.yml:96` | `actions/checkout@v4` uses a mutable tag, which the action owner can repoint. | Accept: first-party/well-known actions pinned to a major tag, WARNING only; pinning to commit SHAs (with Dependabot updates) is optional hardening. | pending |
| `yaml.github-actions.security.github-actions-mutable-action-tag.github-actions-mutable-action-tag` | WARNING | `.github/workflows/ci.yml:143` | `actions/checkout@v4 (semgrep job)` uses a mutable tag, which the action owner can repoint. | Accept: first-party/well-known actions pinned to a major tag, WARNING only; pinning to commit SHAs (with Dependabot updates) is optional hardening. | pending |
| `yaml.github-actions.security.github-actions-mutable-action-tag.github-actions-mutable-action-tag` | WARNING | `.github/workflows/ci.yml:150` | `actions/upload-artifact@v4 (semgrep job)` uses a mutable tag, which the action owner can repoint. | Accept: first-party/well-known actions pinned to a major tag, WARNING only; pinning to commit SHAs (with Dependabot updates) is optional hardening. | pending |

The **Human decision** column is filled in by the user after the issue.
