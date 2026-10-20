# Agent and extension capability table

Snapshot of what every AI agent, command, plugin and tool around this repository can read, write and execute, and which credentials it can reach. Re-read from `.claude/agents/`, `.claude/commands/`, `.claude/settings.json`, `~/.claude/settings.json` and `~/.claude/plugins/installed_plugins.json` on 2026-10-20 (issue #66). Only rule patterns are quoted; no file contents, secrets or raw IPs.

Related: [`docs/ai-data-policy.md`](../docs/ai-data-policy.md), [`docs/security.md`](../docs/security.md).

How to read it: "Credentials reachable" means credentials the item could reach by design or by the permissions it has, not that it uses them. Anything that can run Bash runs as the user, so it can in principle reach whatever the user's shell can (the `gh` token, environment variables, files in the working directory). The only technical barrier today is the `.env*` read rule described in [Example guardrail](#example-guardrail-the-env-read-rule).

## Agents, subagents and commands

| Item | Kind | Source | Can read | Can write | Can execute | Credentials / secrets reachable | Risk and mitigation |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Orchestrator (main session) | agent | The Claude Code session itself; behaviour in [`docs/process.md`](../docs/process.md), [`AGENTS.md`](../AGENTS.md) | Whole working tree; web tools and MCP tools of enabled plugins | Whole working tree (Edit/Write), git commits on the milestone branch | Bash, subagents, plugin tools | Shell environment, `gh` token (via `gh`), Docker | High: widest scope, but supervised by the user. Mitigation: it only orchestrates, does not push or open PRs without the user's go-ahead (`AGENTS.md`), the `.env*` Read deny rule applies |
| `project-manager` | subagent | [`.claude/agents/project-manager.md`](../.claude/agents/project-manager.md); `tools: Bash, Read, Grep, Glob`, `model: sonnet` | Whole working tree | Nothing through Edit/Write; through Bash it can write anything the user can (in practice `gh issue create/edit`) | Bash | `gh` token (creates and edits issues), shell environment | Medium: no Edit/Write, but Bash is unrestricted. Mitigation: role file says it never writes code; runs only at intake |
| `qa-engineer` | subagent | [`.claude/agents/qa-engineer.md`](../.claude/agents/qa-engineer.md); `tools: Bash, Read, Grep, Glob`, `model: sonnet` | Whole working tree | Same as above through Bash (test DBs and Playwright in the scratchpad, `gh issue comment`) | Bash (tests, dev servers on free ports, headless Chromium) | `gh` token, shell environment; test-only SQLite DB and a throwaway user | Medium: Bash is unrestricted although the role forbids changing code. Mitigation: throwaway data only, never uses the user's dev server on port 8000 |
| `software-engineer` | subagent | [`.claude/agents/software-engineer.md`](../.claude/agents/software-engineer.md); no `tools` key (inherits all), `model: sonnet` | Whole working tree | Edit/Write anywhere in the tree, git commits | Bash and every tool of the session, including plugin and MCP tools | `gh` token, shell environment, Docker | High: the widest-privileged subagent. Mitigation: the prompt forbids commits to `main`, pushes and closing issues; a proposal below is to give it an explicit `tools` list |
| `/plan-milestone` | command | [`.claude/commands/plan-milestone.md`](../.claude/commands/plan-milestone.md); `allowed-tools: Bash(gh issue list:*), Bash(gh label list:*), Bash(git status:*), Bash(git log:*), Read, Agent` | Whole working tree, issue and label lists | Nothing directly (delegates to `project-manager`) | Only the listed `gh`/`git` read commands, plus launching subagents | `gh` token (read-only commands) | Low: the narrowest allow-list of the four commands |
| `/next-issue` | command | [`.claude/commands/next-issue.md`](../.claude/commands/next-issue.md); `allowed-tools: Bash, Read, Agent, AskUserQuestion` | Whole working tree | Through Bash only | Bash (unrestricted), subagents | `gh` token, shell environment | Medium: unrestricted Bash. Mitigation: it asks the user before closing the issue |
| `/run-milestone` | command | [`.claude/commands/run-milestone.md`](../.claude/commands/run-milestone.md); `allowed-tools: Bash, Read, Agent, AskUserQuestion` | Whole working tree | Through Bash only; commits via the engineer | Bash (unrestricted), subagents, closes issues after QA PASS | `gh` token (closes issues), shell environment | Medium-high: runs the whole backlog unattended. Mitigation: never pushes or opens PRs; stops after 3 consecutive QA FAILs |
| `/close-milestone` | command | [`.claude/commands/close-milestone.md`](../.claude/commands/close-milestone.md); `allowed-tools: Bash, Read, Edit, Write, Grep, Glob, AskUserQuestion` | Whole working tree | Edit/Write on docs and any file | Bash (unrestricted) | `gh` token, shell environment | Medium: can edit any file. Mitigation: requires a clean tree on the milestone branch and asks before pushing |

## Plugins

Project level: [`.claude/settings.json`](../.claude/settings.json), `enabledPlugins`. User level: `~/.claude/settings.json`, `enabledPlugins` (outside the repository). Plugin tools run inside the session with the session's permissions; a plugin's precise capabilities depend on its own code, which is not audited here, so the columns describe what its purpose requires and the worst case through the session.

| Item | Kind | Source | Can read | Can write | Can execute | Credentials / secrets reachable | Risk and mitigation |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `frontend-design` | plugin (project, enabled) | `.claude/settings.json` | Skill text only | None by itself | None by itself | None | Low: guidance only |
| `playwright` | plugin (project, enabled) | `.claude/settings.json` | Any web page it opens, page content and console | Browser state, screenshots | Drives a browser (MCP tools) | Cookies and session of pages it visits; no repository secrets | Medium: a browser can reach any URL. Mitigation: use only against local throwaway servers; never log into production with it |
| `typescript-lsp` | plugin (project, enabled) | `.claude/settings.json` | Frontend source | None | Runs a language server locally | None | Low |
| `chrome-devtools-mcp` | plugin (project, enabled) | `.claude/settings.json` | Page content, network requests, console, cookies of the pages it opens | Page state, traces | Drives Chrome, runs scripts in pages | Cookies and request headers of visited pages | Medium: can see session cookies and network traffic of any page it opens. Mitigation: local throwaway app only |
| `commit-commands` | plugin (user, enabled) | `~/.claude/settings.json` | Git status and diff | Commits; its push-and-PR skill can push | git, `gh` | `gh` token, git credentials | Medium: includes a push/PR skill. Mitigation: the repository rule is to push only when the user asks |
| `claude-md-management` | plugin (user, enabled) | `~/.claude/settings.json` | CLAUDE.md files | CLAUDE.md files | None beyond edits | None | Low-medium: can change instruction files that steer every agent; review its diffs |
| `context7` | plugin (user, enabled) | `~/.claude/settings.json` | Sends library-documentation queries to an external documentation service | None locally | Network queries (MCP) | None, but query text leaves the machine | Low-medium: never put secrets or production data in a query |
| `skill-creator` | plugin (user, enabled) | `~/.claude/settings.json` | Skill files | Skill files | Can run evaluation scripts | Shell environment | Low-medium |
| `security-guidance` | plugin (user, enabled) | `~/.claude/settings.json` | Files being edited | None by itself | Hook-style security reminders | None | Low |
| `claude-security` | plugin (user, enabled) | `~/.claude/settings.json` | Whole working tree (scans) | Report and patch files, workspace clone | Bash and read-only scan subagents | Shell environment | Medium: scans read the whole tree. Mitigation: `.env*` is gitignored and the Read rule applies; findings must not be committed unredacted |
| `superpowers` | plugin (user, installed, disabled) | `~/.claude/settings.json` (`false`) | n/a | n/a | n/a | n/a | None while disabled |

### Installed but disabled

`~/.claude/plugins/installed_plugins.json` also lists `vercel`, `posthog` and `supabase` (plus `superpowers`, which is explicitly set to `false`). They are not enabled in either settings file, so they are inactive. They connect to third-party hosting, analytics and database services, so they must stay disabled unless [`docs/ai-data-policy.md`](../docs/ai-data-policy.md) is updated first. `vercel`, `posthog` and `supabase` also do not appear in `enabledPlugins`, which means enablement would be a deliberate step. Proposal: uninstall them if they are not needed.

## User-level settings and external tools

| Item | Kind | Source | Can read | Can write | Can execute | Credentials / secrets reachable | Risk and mitigation |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `disableClaudeAiConnectors: true` | user setting | `~/.claude/settings.json` | n/a | n/a | n/a | Prevents claude.ai connectors (mail, drive, etc.) from being available to the session | Mitigation in effect; keep it on |
| `syncClaudeAiSkills: false`, `syncClaudeAiPlugins: false` | user setting | `~/.claude/settings.json` | n/a | n/a | n/a | Prevents skills and plugins from the claude.ai account being synced into the session | Mitigation in effect; keep both off |
| `permissions.deny` for `.env*` | user setting (guardrail) | `~/.claude/settings.json` | Blocks the Read tool on `.env*` | n/a | n/a | Protects local env files | See the next section |
| `gh` CLI | external tool | Installed on the machine, authenticated as the user | Issues, PRs, repository content, Actions logs | Issues, comments, labels, PRs, and anything its token scope allows | Via Bash only | The user's GitHub token, stored by `gh` outside the repository; used by `gh` without being shown. Scope: described by `gh auth status` (typically repo and workflow access for a login made with default scopes); verify and prefer a minimal scope | Medium-high: the token can modify the repository and its workflows. Mitigation: agents are told not to push or open PRs; proposal below on reducing the scope |
| Docker | external tool | Docker Desktop with WSL integration | Local images and containers | Local images, containers, volumes | Builds and runs containers | Whatever is mounted or passed into a container; none by default | Medium: Docker access is close to root on the host. Mitigation: only the project `Dockerfile` and `docker-compose.yml` and throwaway `postgres:17` containers are used |
| Playwright + headless Chromium | external tool | Installed by QA in the session scratchpad; not in `package.json` | Pages of the local throwaway app | Scratchpad files | Headless browser | None (throwaway user and DB) | Low: not a project dependency, used only against local servers |

## Example guardrail: the `.env*` read rule

- **Where it is configured:** `permissions.deny` in the user-level `~/.claude/settings.json`, with the rule patterns `Read(./.env)` and `Read(./.env.*)`. It is a permission rule, not a hook; the repository has no hooks directory. The project `.claude/settings.json` does not repeat it.
- **What it covers:** the Read tool refuses to open a file named `.env` or matching `.env.*` relative to the working directory. This stops an agent from loading a local env file into its context by accident.
- **What it does not cover (known gaps):**
  - The pattern is for the Read tool. Reading the same file through Bash (for example with `cat`) or through a search tool is not necessarily blocked.
  - `./` anchors it to the working directory. An env file in a parent or sibling directory, or one with another name (for example `secrets.txt` or a file under `backend/` if the pattern is read as relative to the root), is not covered.
  - It lives in user settings, so it applies to this user's sessions only; a collaborator, a CI agent or another machine does not get it, and a subagent whose settings differ is not guaranteed to inherit it.
  - It protects files, not environment variables: `JWT_SECRET` or `DATABASE_URL` in the shell environment stay reachable through Bash.
- **Complementary controls in the repository:** `.gitignore` ignores `.env` and the `no-secrets` CI job checks the tracked files, so a secret cannot easily be committed even if an agent writes one.
- **Proposals (not applied; the settings are the user's decision):**
  1. Add `Read(**/.env)` and `Read(**/.env.*)` so env files in subdirectories are covered.
  2. Add Bash deny rules for the obvious readers of env files, knowing they are bypassable, or a `PreToolUse` hook that blocks commands mentioning `.env`.
  3. Mirror the deny rules in the project `.claude/settings.json` so they travel with the repository.
  4. Give `software-engineer` an explicit `tools` list instead of inheriting everything.
  5. Narrow `/next-issue` and `/run-milestone` `allowed-tools` from bare `Bash` to the commands they need (`gh`, `git`, `uv`, `npm`).
  6. Check the `gh` token scope and replace it with a fine-grained token limited to this repository.
  7. Uninstall the unused `vercel`, `posthog` and `supabase` plugins.
