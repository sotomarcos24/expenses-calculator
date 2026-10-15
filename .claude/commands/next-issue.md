---
description: Pick the next open issue of the current milestone and run it through groom → implement → QA, then ask the user before closing
argument-hint: "[issue number, optional]"
allowed-tools: Bash, Read, Agent, AskUserQuestion
---

Run **one issue** through steps 1–5 of `docs/process.md`, then hand the closing decision to the user.
You are the orchestrator: you never groom, implement or test yourself — the subagents do.

## 1. Pick the issue

- If an argument was given (`$ARGUMENTS`), use issue `#$ARGUMENTS` (check it is open and has an `m<N>` label).
- Otherwise:
  - The current milestone is the first one in the status table of `docs/milestones.md` that is not ✅ Done (skip `M9` unless the user asked for it).
  - `gh issue list --label m<N> --state open` and take the **lowest issue number** whose dependencies ("Depends on #X" in the body) are all closed.
  - If the milestone has no issues at all, stop and suggest `/plan-milestone`. If all are closed, stop and tell the user the milestone is ready for wrap-up (step 8).
- Tell the user (in Spanish) which issue you picked and why, then continue without waiting.

## 2. Branch and baseline

- The work happens on the milestone branch `m<N>-<slug>` (see `AGENTS.md` → *Workflow*). Check `git status` and `git branch`.
- If the branch does not exist yet (first issue of the milestone): create it from an up-to-date `main` and run the full checks of both projects (`docs/backend.md`, `docs/frontend.md`) to confirm the baseline is green. If the baseline is red, stop and tell the user.
- If the working tree is dirty or you are on another branch with unrelated work, stop and ask the user.

## 3. Groom → Implement → Verify

Every subagent starts without context: always pass the issue number, the branch name and anything relevant the user said.
Subagent reports are at most 5 lines; do not read full issue comments unless a step needs them (e.g. the QA FAIL comment to pass to the engineer, or the details for the verdict report below).

1. **Groom** — if the issue already has the `groomed` label, skip this step. Otherwise launch `project-manager` with the issue number (step 2).
2. **Implement** — launch `software-engineer` with the issue number and the branch (step 3). If the engineer reports that an acceptance criterion is wrong or impossible, send it back to the PM and then to the engineer again.
3. **Verify** — launch `qa-engineer` with the issue number and the branch (step 4).
4. **On `## QA: FAIL`** — launch `software-engineer` again passing the latest QA comment, then QA again (step 5). After **3 consecutive FAILs**, stop and ask the user how to proceed.

## 4. Verdict — the user decides

When QA posts `## QA: PASS`, **do not close the issue**. Report to the user, in Spanish:

- Issue number, title and link.
- What the engineer did (commits on the branch, files touched, tests added).
- The QA verdict: each acceptance criterion with its result, the checks run and any observation QA made.
- Number of FAIL → retry cycles it took, and any follow-up issues the PM filed.

Then ask with `AskUserQuestion` whether to close it:

- **Close it** → `gh issue close <n> --comment "Closed after QA PASS"` (step 6).
- **Leave it open** → do nothing more; if the user gives feedback, it becomes the input for a new engineer → QA cycle.

Stop after this issue. Do not pick the next one, push, or open a PR unless the user asks. To run the whole backlog without approvals between issues, the user uses `/run-milestone`.
