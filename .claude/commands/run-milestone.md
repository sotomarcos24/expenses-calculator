---
description: Run every open issue of the current milestone through implement → QA → close, without asking between issues
argument-hint: "[milestone number, optional]"
allowed-tools: Bash, Read, Agent, AskUserQuestion
---

Run **steps 1 and 3–7** of `docs/process.md` (no grooming: `/plan-milestone` already planned every issue) for every open issue of the current milestone, one after another, without asking the user between issues.
You are the orchestrator: you never groom, implement or test yourself — the subagents do.

## 1. Milestone and branch

- Milestone: `M$ARGUMENTS` if an argument was given; otherwise the first milestone in the status table of `docs/milestones.md` that is not ✅ Done (skip `M11` unless the user asked for it).
- `gh issue list --label m<N> --state open`. If the milestone has no issues at all, stop and suggest `/plan-milestone`. If all are closed, go to step 4 below.
- The work happens on the milestone branch `m<N>-<slug>` (see `AGENTS.md` → *Workflow*). If it does not exist yet, create it from an up-to-date `main` and run the full checks of both projects (`docs/backend.md`, `docs/frontend.md`) to confirm the baseline is green; if red, stop and tell the user.
- If the working tree is dirty or you are on another branch with unrelated work, stop and ask the user.
- Tell the user (in Spanish) the milestone and the issues you are about to run, then continue without waiting.

## 2. Loop over the issues

Pick the open issue with the **lowest number** whose dependencies ("Depends on #X" in the body) are all closed. If open issues remain but none has its dependencies closed, stop and tell the user. If the picked issue lacks the `groomed` label, stop and tell the user; never launch the PM to groom it.

For that issue (every subagent starts without context: always pass the issue number, the branch name and anything relevant the user said):

1. **Implement** — launch `software-engineer` with the issue number and the branch (step 3). Only if the engineer reports that an acceptance criterion is wrong or impossible, launch `project-manager` for that issue alone (the one exception) and then the engineer again.
2. **Verify** — launch `qa-engineer` with the issue number and the branch (step 4).
3. **On `## QA: FAIL`** — read that QA comment, launch `software-engineer` again passing it, then QA again (step 5). After **3 consecutive FAILs** on the same issue, stop the whole run and ask the user how to proceed.
4. **On `## QA: PASS`** — close it: `gh issue close <n> --comment "Closed after QA PASS"` (step 6). Tell the user in one line (issue, commits, number of QA cycles) and pick the next issue.

Subagent reports are at most 5 lines. Do not read full issue comments unless a step needs them (e.g. the QA FAIL comment for the engineer).

## 3. Never

- Never push, open a PR or merge.
- Never ask the user between issues; the only stops are the ones listed above and below.

## 4. Backlog empty

When the milestone has no open issues, report to the user in Spanish: the issues closed in this run (number, title, commits, QA cycles), any follow-up issues the PM filed, and suggest `/close-milestone`. Then stop.
