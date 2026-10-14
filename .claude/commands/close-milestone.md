---
description: Wrap up a finished milestone — verify it, update every project doc so the next session starts from an accurate state, commit, and offer push + PR
argument-hint: "[milestone number, optional]"
allowed-tools: Bash, Read, Edit, Write, Grep, Glob, AskUserQuestion
---

Run **step 8 (Milestone wrap-up)** of `docs/process.md` and leave the repository so that a brand-new session or agent, reading only `AGENTS.md` and the docs it links, knows exactly what exists and what comes next.

## 1. Identify the milestone and check it is really finished

- Milestone: `M$ARGUMENTS` if an argument was given; otherwise the first milestone in the status table of `docs/milestones.md` that is not ✅ Done.
- You must be on its branch `m<N>-<slug>` with a clean working tree (`git status`). If not, stop and ask the user.
- `gh issue list --label m<N> --state open` must be empty. If not, list the open issues and stop (suggest `/next-issue`).
- Every closed `m<N>` issue must have a `## QA: PASS` comment (`gh issue view <n> --comments`). List any that do not and stop.

## 2. Run the full checks

Run the full check set of **both** projects exactly as described in `docs/backend.md` and `docs/frontend.md` → *Commands*, including:

- Backend: `ruff format --check`, `ruff check`, `mypy`, `pytest`, and `alembic upgrade head` on a clean throwaway DB.
- Frontend: `npm run lint`, `format:check`, `typecheck`, `test`, `build`.
- API contract: re-export `openapi.json` and regenerate the frontend types; there must be no diff (CI fails otherwise).

If anything fails, report the output and stop — do not "fix" code here; that goes back to the normal issue loop.

## 3. Confirm the Definition of done and the acceptance criteria

- Go through the **Definition of done** in `docs/milestones.md` and every acceptance criterion of the milestone. For each criterion, name the closed issue(s) and the code/tests that satisfy it.
- Check the non-negotiable rules in `AGENTS.md` for the new code (data-isolation tests on every new endpoint, no `float` for money, etc.).
- If a criterion is not met, stop and tell the user which one and why. Do not tick it.

## 4. Update the documentation

Use `git diff main...HEAD --stat` and the closed issues to know what really changed; **the code is the source of truth**.

- `docs/milestones.md`: mark the milestone ✅ Done in the status table and its heading, tick its acceptance criteria (`- [x]`), and remove its `#### Progress notes` if any.
- `docs/plan.md` §8: same status update.
- `AGENTS.md` → *Current state*: list the milestone as done and point to the **next** milestone (name, branch `m<N+1>-<slug>`, and whether it has issues yet — if not, say `/plan-milestone` creates them). Update the list of open issues not tied to a milestone (`gh issue list --state open`) — including any `follow-up` / `backlog` issues filed during this milestone.
- `docs/backend.md` and `docs/frontend.md` → *Current state* (and *Commands* / *Known caveats* if they changed): describe the models, migrations, endpoints, pages, components and libraries that now exist; remove notes that are no longer true (placeholders replaced, libraries no longer pending, etc.).
- `docs/tech-spec.md` (and `docs/plan.md` if needed): if the implementation deviated from the spec, update it and mention it to the user.
- Any other doc that references the old state (grep for the milestone number, "placeholder", "pending", "not yet"). Keep docs in English.

## 5. Commit

Commit all doc changes on the milestone branch with a message like `Close milestone N (<name>)`, a short body listing what was updated, and the attribution line. Never commit on `main`.

## 6. Report and hand off

Tell the user, in Spanish:

- Results of the checks.
- Acceptance criteria → issues mapping.
- What was updated in each doc, and any spec deviation.
- Open follow-up / backlog issues that need their decision.
- What the next step is (next milestone and the command to start it).

Then ask with `AskUserQuestion` whether to **push the branch and open the PR** to `main` (`gh pr create`, description summarizing the milestone and listing the closed issues). Only if they say yes, push and open it, then show the PR link and the CI status. Do not merge the PR unless the user explicitly asks; if they do, after the merge switch to `main` and `git pull` so the local repo is up to date for the next milestone.
