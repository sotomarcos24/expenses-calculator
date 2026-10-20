# AI tool and data policy

What AI tools are used on PersonalDolar, what they may see, and what they must never see. Part of the [security index](security.md) (rubric criterion 13). The per-item detail (what each agent, command and plugin can read, write and execute) is in [`security-audit/capability-table.md`](../security-audit/capability-table.md).

## AI tools used and why

- **Claude Code, main session (orchestrator).** Reads the repository, launches subagents, closes issues after QA PASS. Needed to run the workflow in [`process.md`](process.md).
- **Three subagents on Sonnet**, declared in `.claude/agents/`: `project-manager` (writes groomed issues), `software-engineer` (implements an issue and commits on the milestone branch) and `qa-engineer` (verifies against the acceptance criteria). They exist to keep roles separate and every step recorded in issue comments.
- **Plugins** enabled at project and user level (frontend design guidance, Playwright, TypeScript language server, Chrome DevTools, commit helpers, CLAUDE.md management, library documentation lookup, skill creator, security guidance, Claude Security scanning). Each is listed with its risk in the capability table. Plugins that are installed but disabled must stay disabled unless this policy is updated first.
- **No AI tool is part of the running application.** There is no model call, AI feature or AI service in the app, which matches the non-goals in [`plan.md`](plan.md) section 6.

## What agents may see

- Source code, docs and specs of this repository (the repository is public).
- Synthetic or throwaway data: throwaway SQLite databases, newly registered test users, test fixtures.
- CI logs of this repository, after checking that they contain no secrets or raw client IPs.
- Masked excerpts of operational logs, as in [`operations/rate-limit-diagnosis.md`](operations/rate-limit-diagnosis.md).

## What agents must not see

- Secrets: `JWT_SECRET`, `RENDER_DEPLOY_HOOK`, any `DATABASE_URL` that contains credentials, tokens and API keys of any provider.
- `.env` and `.env.*` files (blocked for the Read tool by a user-level rule; see the capability table for what that rule does and does not cover).
- Production data and the production database, including backups and dumps.
- User emails and passwords, real or hashed.
- Raw client IP addresses from logs. Mask them before sharing, keeping only the first two octets and using `x.x` for the rest, as in the rate-limit diagnosis.

The production deployment is operated by the user. Agents work against the repository and local throwaway environments only.

## What Claude Code sends to Anthropic

In general terms: the prompts and instructions given to it, the contents of files it reads, the output of commands and tools it runs, and the conversation history, so the model can answer. Anything an agent reads or prints can therefore leave the machine, which is why the rules above are about what agents may read and not only about what they may commit. The data handling terms are those of the user's Anthropic plan and are not restated here. MCP and documentation plugins may also send query text to their own services.

## Rules for sharing logs

1. Mask IP addresses (`87.235.x.x` style) before pasting a log into an issue, a document or a chat.
2. Never paste tokens, cookies, `Authorization` headers, deploy hooks or connection strings.
3. Remove user emails and any other personal data from excerpts.
4. Prefer a short excerpt that shows the point over a full log.

## After an accidental exposure

1. Treat the secret as compromised: rotate it at once (generate a new `JWT_SECRET`, regenerate the Render deploy hook, change the database password, revoke the token).
2. Update the value where it is configured (provider environment, GitHub secret) and redeploy if needed.
3. If it was committed, rotating is mandatory even after removing it from the history, because the old value remains in clones and caches.
4. Note what happened, when, and what was rotated, in the relevant issue or in a dated file under `security-audit/`, without writing the secret itself.

## Related

- [`security.md`](security.md): index of the security artefacts.
- [`operations/rate-limit-diagnosis.md`](operations/rate-limit-diagnosis.md): operational diagnosis with masked IPs.
- [`../security-audit/capability-table.md`](../security-audit/capability-table.md): capabilities, credentials reachable and risks per agent and plugin.
