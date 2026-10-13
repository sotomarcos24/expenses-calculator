# Task template

Used by the Project Manager to groom every issue (see [`process.md`](process.md)). Copy the four sections into the issue body.

```markdown
## Context

Why this task exists and what it is part of. Link the milestone (`docs/milestones.md#m<N>-...`)
and the spec sections it implements (`docs/plan.md` §…, `docs/tech-spec.md` §…).

## Scope

What to build, as concrete items. Name the files, modules, endpoints or pages involved and any
constraint that applies (e.g. money as `Decimal`, 404 on other users' data, theme tokens only).

- ...

## Acceptance criteria

Each one checkable by looking at the result — a request and its response, a screen and what it
shows, a test that exists and passes.

- [ ] ...

## Out of scope

What this task deliberately does not do. Every item moved elsewhere links to its follow-up issue.

- ... → #<issue>
```
