# Security index

Index of the security artefacts of PersonalDolar (rubric criterion 13, milestone M9).

## The five artefacts

1. **PR audit.** Security review of a merged pull request using a reusable brief: [`security-audit/runs/2026-10-20-pr-58-audit.md`](../security-audit/runs/2026-10-20-pr-58-audit.md), produced with [`security-audit/audit-brief.md`](../security-audit/audit-brief.md).
2. **Semgrep findings.** Deterministic static analysis, also run in CI: [`security-audit/semgrep-findings.md`](../security-audit/semgrep-findings.md), with the stored run [`security-audit/runs/2026-10-20-semgrep-local.json`](../security-audit/runs/2026-10-20-semgrep-local.json).
3. **Agent security notes.** What each agent, subagent, command, plugin and tool can read, write and execute, with the `.env*` guardrail and its gaps: [`security-audit/capability-table.md`](../security-audit/capability-table.md).
4. **Operational diagnosis.** The rate limit that did not trigger in production, with masked IPs: [`docs/operations/rate-limit-diagnosis.md`](operations/rate-limit-diagnosis.md).
5. **AI and data policy.** What agents may and may not see, which AI tools are used and why: [`docs/ai-data-policy.md`](ai-data-policy.md).

## Existing controls

The non-negotiable rules in [`AGENTS.md`](../AGENTS.md) define the controls that are in the code: Argon2 password hashing, the JWT only in an httpOnly cookie, data isolation per user, secrets only from environment variables (the `no-secrets` CI job checks tracked files), and rate limiting on authentication endpoints.

## Pending human decisions

The audit and Semgrep reports have a **Human decision** column, filled only by the user. All rows are `pending` today: those in the Semgrep report and in the PR audit. Filling them is tracked in issue #69 (M9 was closed with this left to the user). The capability table lists proposals (hardening the `.env*` rule, narrowing tool access, token scope, removing unused plugins) that also wait for the user's decision; no settings were changed.
