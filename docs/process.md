# Process — from request to done

How work moves from "the user asks for something" to "it is merged". The main agent session acts as an **orchestrator** that delegates every step to a team of subagents. Read this together with [`AGENTS.md`](../AGENTS.md) and [`milestones.md`](milestones.md).

## Roles

| Role | Who | Definition | Does | Never does |
| --- | --- | --- | --- | --- |
| Orchestrator | Main session | This document | Picks issues, launches subagents, passes context between them, closes issues, reports to the user | Grooms, implements or tests; reads full issue comments it does not need |
| Project Manager | Subagent `project-manager` | [`team/pm.md`](team/pm.md) | Creates and grooms the milestone's issues with [`task-template.md`](task-template.md) at intake only; re-grooms one issue only when the engineer reports an invalid criterion | Writes code |
| Software Engineer | Subagent `software-engineer` | [`team/software-engineer.md`](team/software-engineer.md) | Implements one groomed issue, writes tests, commits | Closes issues, changes acceptance criteria |
| QA Engineer | Subagent `qa-engineer` (Sonnet) | [`team/qa-engineer.md`](team/qa-engineer.md) | Checks the work against the acceptance criteria, posts PASS/FAIL | Changes code |

The subagents are declared in `.claude/agents/`; their behaviour comes from the files in `docs/team/`. Every subagent ends with a report to the orchestrator of **at most 5 lines** (issue number, status/verdict, commits, blockers); all details go in the issue comment.

## The backlog

- The backlog is the list of **open GitHub issues** in `sotomarcos24/expenses-calculator`, managed with the `gh` CLI.
- Every issue belongs to a milestone through a label `m<N>` (e.g. `m2`). Only issues of the milestone **in progress** (see the status table in `milestones.md`) are picked.
- An issue is **groomed** when it has the label `groomed` and its body follows the task template.
- Order: lowest issue number first, unless an issue says it depends on another open one.

## Lifecycle

```text
 user request
      │
      ▼
 0. Intake ──► groomed issues in the backlog (labels m<N> + groomed)
      │
      ▼
 1. Pick next open issue ◄──────────────────────────┐
      │                                             │
      ▼                                             │
 3. Engineer implements it ◄──────┐                 │
      │                           │ FAIL            │
      ▼                           │ (QA comment     │
 4. QA verifies it ───────────────┘  as input)      │
      │ PASS                                        │
      ▼                                             │
 6. Orchestrator closes the issue ──────────────────┘
      │ backlog for the milestone empty
      ▼
 8. Milestone wrap-up
```

### 0. Intake

The user's request becomes issues before any work starts.

- **"Start / continue milestone N"**: if the milestone has no open issues yet, the PM breaks the milestone section of `milestones.md` into issues **and grooms all of them in the same pass** (task template, labels `m<N>` and `groomed`). Aim for 2–3 issues per milestone (e.g. backend + its tests, frontend + its tests); split further only if an issue would not fit in one engineer session.
  The `/plan-milestone [N]` command runs only this step for the next pending milestone (or milestone N) and stops.
- **A single task or bug**: the PM files it as one issue with the label of the current milestone (or `backlog` if it belongs to none — ask the user before working on it).
- If the request is a non-goal (`plan.md` §6), the orchestrator tells the user instead of filing it.

### 1. Pick

The orchestrator picks the next open issue of the current milestone (see *The backlog*). Before the first issue of a milestone, it makes sure the branch `m<N>-<slug>` exists, created from an up-to-date `main`, and that the baseline checks are green.

### 2. Groom (PM) — intake only

The PM does **not** take part in the per-issue loop: the issue created at intake already is the plan. Two cases only:

- **Intake (step 0)**: the PM creates and grooms the issues.
- **Exception**: the engineer reports an acceptance criterion that is wrong or impossible; the orchestrator launches the PM for that issue alone, then the engineer again.

If an issue picked by the loop lacks the `groomed` label, the loop stops and asks the user; it never launches the PM by itself.

### 3. Implement (Engineer)

The orchestrator launches `software-engineer` with the issue number (and, on a retry, the latest QA comment). The engineer works on the milestone branch, runs the full checks of the side(s) changed, commits, and comments on the issue with what was done. If an acceptance criterion is wrong or impossible, the engineer comments on the issue and stops; the orchestrator sends it back to the PM (step 2).

### 4. Verify (QA)

The orchestrator launches `qa-engineer` with the issue number. QA stays independent of the engineer and checks every acceptance criterion:

- It runs only the test suite of the side(s) the issue changed, not the full checks of both projects: the engineer already ran them and CI runs them again on the PR.
- **Backend issues**: QA reads the diff and the tests and checks that every acceptance criterion is covered by a test that would fail if the feature broke. It exercises by hand only what has no such test.
- **UI issues**: QA starts the dev servers (throwaway DB, newly registered user) and checks in the browser only when the issue changes a page, and only at desktop width. Mobile (375px) is checked once in M8, not per issue.
- QA never uses a dev server it did not start: it starts its own on free ports (never 8000, which belongs to the user) and stops them when done (see `AGENTS.md` → *Environment*).

QA posts a `## QA: PASS` or `## QA: FAIL` comment with a verdict per acceptance criterion. QA does not edit files.

### 5. On FAIL

Back to step 3, passing the QA comment to the engineer as input (the one case where the orchestrator reads a full issue comment). After **3 consecutive FAILs** on the same issue, the orchestrator stops the loop and asks the user how to proceed.

### 6. On PASS

The orchestrator — and only the orchestrator — closes the issue (`gh issue close <n> --comment "Closed after QA PASS"`).

### 7. Repeat

Go back to step 1 until the milestone has no open issues.

Two commands run this loop:

- `/run-milestone [N]` runs steps 1 and 3–7 for **every** open issue of the milestone, lowest number first and respecting "Depends on", without asking between issues. It closes each issue automatically on QA PASS and stops only after 3 consecutive FAILs on one issue (to ask the user) or when the backlog is empty (then it suggests `/close-milestone`). It never pushes or opens a PR.
- `/next-issue [n]` runs steps 1 and 3–5 for **one** issue (the next one of the current milestone, or issue n), reports the QA verdict and closes the issue only if the user confirms.

### 8. Milestone wrap-up

When the milestone backlog is empty, the orchestrator:

1. Runs the full check set of both projects and confirms the milestone **Definition of done** in `milestones.md`.
2. Ticks the acceptance criteria, updates the status in `milestones.md` and in `plan.md` §8, and the *Current state* sections of `AGENTS.md`, `backend.md` and `frontend.md`.
3. Reports to the user and asks whether to push the branch and open the PR. Pushing and opening PRs only happen when the user says so.

The `/close-milestone [N]` command runs this step: it verifies the milestone, updates every doc, commits on the milestone branch and asks before pushing.

## Rules

- Never implement an issue that is not groomed. The loop never grooms: a missing `groomed` label stops it and the user decides.
- The engineer does not close the issue.
- QA does not fix the code; it only outputs PASS or FAIL.
- The orchestrator closes the issue only after QA outputs PASS.
- The orchestrator does not groom, implement or test itself; it only reads enough to pass context and to decide the next step. It relies on the subagents' 5-line reports and reads full issue comments only when a step needs them (e.g. a QA FAIL comment to pass to the engineer).
- Subagents start without the conversation's context: the orchestrator always passes the issue number, the branch name, and anything the user said that matters.
- All communication between roles happens through **issue comments**, so the history of every task lives in its issue.
- QA only uses dev servers it started itself, on free ports (never 8000), and stops them when done.
- Commits happen on the milestone branch only, never on `main`. Push and PRs need the user's go-ahead.
- If the session ends mid-milestone, the orchestrator leaves **Progress notes** in `milestones.md` (see `AGENTS.md` → *Ending a session*), including the issue in progress and the step it was at.

## Labels

| Label | Meaning |
| --- | --- |
| `m<N>` | Belongs to milestone N |
| `groomed` | PM has groomed it (at intake); ready for the engineer. The loop never grooms |
| `follow-up` | Filed by the PM when moving something out of scope |
| `backlog` | Not tied to a milestone; needs the user's decision |
| `accessibility`, `bug`, … | Optional GitHub type labels, added on top of the ones above when they help |

The `m<N>` label of a new milestone is created at intake (`gh label create m<N> --description "Milestone N — <name>" --color 1d76db`).

## Prerequisites

- `gh` installed and authenticated (`gh auth login`) against GitHub.
- The labels above exist in the repository (`gh label create <name>`); the orchestrator creates any missing one the first time it needs it.
