---
description: Find the next milestone and have the PM break it into GitHub issues (intake only, no implementation)
argument-hint: "[milestone number, optional]"
allowed-tools: Bash(gh issue list:*), Bash(gh label list:*), Bash(git status:*), Bash(git log:*), Read, Agent
---

Run **step 0 (Intake)** of `docs/process.md` for the next milestone, and nothing else.
You are the orchestrator: you do not write issues yourself — the `project-manager` subagent does.

## 1. Pick the milestone

- If an argument was given (`$ARGUMENTS`), use milestone `M$ARGUMENTS`.
- Otherwise read the status table in `docs/milestones.md` and take the **first milestone that is not ✅ Done** (skip `M9` unless the user asked for it; it is optional).
- Check that every milestone it *depends on* (column "Depends on") is ✅ Done. If not, stop and tell the user.

## 2. Check it has not been planned already

Run `gh issue list --label m<N> --state all`.

- If the milestone already has issues, **do not launch the PM**. List them to the user and stop.
- If the label does not exist yet, that is expected — the PM creates it.

## 3. Launch the PM

Launch one `project-manager` subagent with a prompt that includes:

- The milestone number and name, and that this is **step 0 (Intake)** of `docs/process.md`: break the milestone section of `docs/milestones.md` into issues.
- Create the label first if missing: `gh label create m<N> --description "Milestone N — <name>" --color 1d76db`.
- One issue per coherent, testable slice (e.g. a backend endpoint + its tests, a page + its tests), ordered so that lower issue numbers do not depend on higher ones. Dependencies between issues are stated in the body ("Depends on #X").
- Bodies in English following `docs/task-template.md`, grounded in `docs/plan.md`, `docs/tech-spec.md` and the milestone's acceptance criteria. Together the issues must cover **every** acceptance criterion of the milestone.
- Label each issue `m<N>` only. Do **not** add `groomed`: grooming is step 2 and happens later, issue by issue.
- Respect the non-goals in `docs/plan.md` §6 and the non-negotiable rules in `AGENTS.md` (data isolation test for every new endpoint, money as `Decimal`/decimal strings, etc.).
- Do not modify repository files, create branches or write code.
- Finish with a report: a table of the issues created (number, title, depends on) and which milestone acceptance criterion each one covers, plus any doubt or spec gap found.

## 4. Report to the user

In Spanish: the milestone chosen, the list of issues created (with links), how the acceptance criteria are covered, and any doubts the PM raised.

Then **stop**. Do not create the branch, groom, implement or test. The user decides when to start executing the issues.
