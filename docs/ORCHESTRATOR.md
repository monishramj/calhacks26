# Orchestrator guide

The orchestrator is one agent session that tracks all four computers. It does the PM bookkeeping from §11 and §22: board, readiness, contract changes, and result honesty. **It doesn't write feature code**, and it never approves its own changes or a gate whose evidence is missing.

The orchestrator and the workstreams communicate through the repo, because agents on different computers can't message each other directly:

| File | Written by | Read by | Purpose |
|---|---|---|---|
| `work/status/<ws>.md` on `origin/ws/<ws>` | that workstream | orchestrator, next shift | Gate/phase, next step, blockers, needs, preflight results |
| `work/inbox/<ws>.md` on `origin/main` | orchestrator | that workstream at session start | Requests, contract-change notices, re-prioritization |
| `work/BOARD.md` on `main` | orchestrator | everyone | Gate status and evidence across computers |
| `work/DECISIONS.md` on `main` | orchestrator, after human sign-off | everyone | Approved deviations, contract versions, command-post choice |
| `work/PREFLIGHT.md` on `main` | orchestrator | everyone | Consolidated §19 first-checkpoint readiness |
| `work/validation/*` on each branch | the gate's workstream | orchestrator | Red/green evidence |

Workstreams never edit the orchestrator's files and the orchestrator never edits theirs, so merging `main` into a `ws/*` branch doesn't conflict.

## Loop (every 20–30 minutes, or when someone asks)

```bash
git fetch origin --prune
for ws in codec-radio state inference web; do
  echo "== $ws"; git log --oneline -5 origin/ws/$ws
  git show origin/ws/$ws:work/status/$ws.md
  git diff --stat origin/main...origin/ws/$ws
done
git branch -r --list 'origin/ws/*-*'   # lanes: check their status files and paths too
python scripts/health.py               # merge conflicts, stray edits, contract drift, secrets, big files, stale branches
gh pr list --state open
```

On each pass:

1. **Ownership check.** Compare each branch's changed paths with the ownership table in `AGENTS.md`. Flag any edit outside owned paths, especially `packages/domain/**` from anyone other than `ws/state`.
2. **Contract drift.** If `packages/domain` changed on `main` since a branch last merged `main`, post to that workstream's inbox: "merge main, contract vX".
3. **Board update.** Set each gate to `not started`, `TEST red`, `IMPL green`, `REVIEW passed`, or `blocked`, with links to its validation file. Use the branch's evidence only, never a status claim without a validation file.
4. **Honesty check.** Look at the validation files. Anything stubbed, fixture-backed, or missing credentials or hardware must say so. A gate that only passed against mocks is not `REVIEW passed` for a real-provider requirement.
5. **PRs.** Merge a PR into `main` only when: paths are owned, CI or local `npm test` and pytest pass on the merge result, the validation file exists, and the PR body lists real / mocked / unavailable / failing. Otherwise comment with what's missing.
6. **Blockers and handoffs.** If a status file shows a blocker another workstream can solve, post it to that workstream's inbox. If a prerequisite is unavailable (§19), re-estimate in `work/BOARD.md` and propose a scope cut per §23 for a human to approve.
7. **Idle workstreams.** If a workstream has finished and others are behind, post a ready, unowned task to its inbox. Never ask it to expand its own feature.

## Things only a human decides

The orchestrator drafts these and waits for a person to confirm in chat or in a PR review:

- Any change to `docs/GROUND_TRUTH.md` or a new `work/DECISIONS.md` entry.
- Contract version bumps.
- Held-out labels in `fixtures/private/heldout/`: the PM (pitch role) owns them.
- Scope cuts and the final pitch claims (§21, §22).

## Bootstrap prompt

```text
You are the orchestrator for calhacks26 on branch main. Read AGENTS.md,
docs/ORCHESTRATOR.md, docs/WORKSTREAMS.md, and docs/GROUND_TRUTH.md
(§11, §12, §14, §16, §19, §22, §23 fully; skim the rest). Then run one
loop pass from docs/ORCHESTRATOR.md and report: gate status per workstream,
ownership or contract violations, blockers, and what each computer should do
next. Write only to work/BOARD.md, work/PREFLIGHT.md, and work/inbox/*.
Draft anything in "Things only a human decides" and ask before committing it.
Don't write feature code.
```
