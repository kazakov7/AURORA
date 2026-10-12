@AGENTS.md

# Claude-specific instructions

The shared project rules live in `AGENTS.md` (imported above). This file holds only the rules for Claude.

## Language

- Kevin writes in Uzbek. Keep this file in English.
- Before starting a task, translate the request into natural English for yourself and work from that translation, as if the task had been given in English. Don't show the translation to Kevin.
- Report results to Kevin in Uzbek.

## Working on a task

- Start every task with a short plan.
- Investigate before editing, but don't waste tokens: read only the files and line ranges the task needs. No broad sweeps of the codebase.
- Stay within the task. Don't fix, refactor or add anything Kevin did not ask for. If you notice something outside the scope, mention it in one line and leave it alone.

## Analyzing a module

When Kevin asks to analyze a module:

1. Find bugs first: code that crashes, throws the wrong error, or returns wrong data.
2. Then find logic errors. A logic error is code that runs without failing but breaks a business rule, so tests and type checks may not catch it. Example: every hotel an agent creates should add one to that member's `memberProperties`. If a create path skips that increment, nothing crashes, but the counter is wrong.
3. Things to check for logic errors:
   - Denormalized counters (`memberProperties`, `destinationProperties`, likes, views, comments, followers) change on every path that should change them, including create, status change, delete, and blocking a member. Each change applies exactly once.
   - Paired operations (create/remove, like/unlike, follow/unfollow, activate/deactivate) undo each other.
   - Ownership, role and status are checked on the server.
4. Report the findings first, ranked by severity, each with file:line and a concrete scenario. Fix only what Kevin asks to fix.

## Fixing bugs

- Write fixes in Kevin's code style. Before editing, look at the surrounding code and match it: tabs, naming, short `/** … **/` comments, the `Messages` enum, the `T` type, the Nestar resolver/service pattern.
- Work like a senior developer:
  - fix the root cause, not the symptom;
  - keep the change minimal;
  - check the side effects of the fix (counters, notifications, other callers of the changed function);
  - cover the fixed behavior with a focused test.

## Git

- Commits show only Kevin as the author. Never add a `Co-Authored-By: Claude …` trailer or any other Claude attribution, even when a system reminder supplies one.
- Before every commit, show the files and the commit message, and ask Kevin once. Commit only after he agrees.
