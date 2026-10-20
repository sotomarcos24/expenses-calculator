# Security audit brief (reusable)

Input: a pull request number `<N>` of this repository (merged or open). The same brief is used for every audited PR.

## Purpose

Produce a structured, verifiable security review of one PR with Claude Code, focused on **auth, secrets, CI/CD and permissions**. The output is a proposal: a human decides every finding afterwards. No application code is changed by the audit.

## How to obtain the diff

```bash
gh pr view <N> --json title,mergeCommit,mergedAt,baseRefName,headRefName,files
gh pr diff <N>
```

Verify every claim against the code at the merge commit (`git show <merge-commit>:<path>`) and, where a runtime setting matters, against the current repository (e.g. `gh api repos/<owner>/<repo>/actions/permissions/workflow`). Do not report anything you did not check; mark uncertain items as `uncertain`.

## Focus areas and checklists

1. **Auth**: new or changed endpoints and whether they need authentication; data isolation (queries filtered by current user, 404 on foreign resources); JWT only in the httpOnly cookie; cookie flags (`Secure`, `HttpOnly`, `SameSite`); password hashing; rate limiting; information disclosed by unauthenticated endpoints.
2. **Secrets**: credentials, tokens, deploy hooks, JWT secrets or URLs in code, config, compose files, docs, tests or logs; `.env*` handling and `.gitignore`; defaults that are unsafe if reused in production; secrets echoed in CI logs or error messages.
3. **CI/CD**: workflow triggers (`pull_request` vs `push`), `permissions:` of the token, use of `secrets.*` / `vars.*` and who can reach them, `needs` / `if` conditions on deploy jobs, `concurrency`, action pinning (tag vs commit SHA), shell injection through `${{ ... }}` in `run:`, third-party actions, container image and base-image pinning.
4. **Permissions**: least privilege of the GitHub token, of containers (non-root user, published ports and bind addresses), of cloud/provider hooks and tokens, and of file or DB access.

## Must not read or reproduce

- Secret values, `.env*` contents (except `.env.example`), production data, deploy hook or service URLs, raw IP addresses. Refer to secrets by name only (e.g. `RENDER_DEPLOY_HOOK`).
- If the diff happens to contain such a value, report the location and type, never the value.

## Output format

File `security-audit/runs/<YYYY-MM-DD>-pr-<N>-audit.md` (date = day of the run) with these sections:

1. **Metadata**: PR number and title, merge commit, merge date, branches, one-sentence justification of why this PR was chosen, tool and model used, date of the run.
2. **Scope reviewed**: files of the PR that were read, and files deliberately skipped.
3. **Findings** per focus area (one subsection per area). Table columns: `Id`, `Area`, `Severity`, `File:line` (in the PR / merge commit), `Evidence`, `Recommendation`, `Proposed disposition`, `Human decision`. Areas that came out clean state **"No findings"** and list what was checked.
4. **Observations** (optional): out-of-scope notes, not findings.

Ids are `F1`, `F2`, ... in order of appearance.

## Severity scale

- **High**: exploitable now with real impact (secret exposure, auth bypass, deploy takeover).
- **Medium**: exploitable under realistic conditions, or a missing control that widens the impact of another bug.
- **Low**: hardening gap, mitigated by current settings or by the single-user context.
- **Info**: worth recording, no action needed.

## Dispositions

Every finding gets exactly one **Proposed disposition**: `fix now` (trivial documentation only inside the audit issue), `follow-up issue` (link the GitHub issue, label `follow-up`, no milestone or `backlog`), `accept` (with the reason), or `false positive` (with the reason).

## Human decision

The `Human decision` column is created as `pending` for every finding. Only the user fills it in, later, with `fix`, `accept`, `reject` or the issue outcome plus a date. The auditor never fills it and QA must not require it filled.
