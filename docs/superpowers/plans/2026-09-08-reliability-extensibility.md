# DailyFlow reliability and extension foundation implementation

Goal: Fix the audited core failures and improve UI consistency while preserving a stable, versioned extension boundary.
Architecture: Keep Tauri/React/Zustand/SQLite. Core owns task state, command results and persistence; extensions receive scoped lifecycle resources and public services. Preserve API v1 compatibility and legacy course behavior. Built-in extensions are trusted application modules, not a security sandbox.
Execution: Subagent-driven development for independent modules; main agent owns task semantics and integration. All edits are in the isolated workspace copy because the original repository is read-only for this session. Deliver a reviewable patch and validation instructions.

## Task 1 — Reliable writes, drafts and undo
- [x] Bring the previously failing audit cases into the test suite with descriptive names.
- [x] Change task creation/update commands to return `Promise<boolean>`; on failure return false and retain forms. Conversion callbacks accept boolean or legacy void, and stop when the result is false.
- [x] QuickAddTask uses a synchronous pending ref, disables submit while pending, ignores composing Enter and clears only after success.
- [x] Key TaskDetail editor state by task identity so A's draft cannot be applied to B; preserve save failure state.
- [x] Add projectId, parentId and courseId to task undo fields; exercise undo and redo.
- [x] Validate with the targeted task, note conversion and component tests, then TypeScript.

## Task 2 — Repeated task identity
- [x] Add nullable repeat source identity plus an occurrence-date unique constraint via a new migration; preserve old rows.
- [x] On repeated completion find/reuse the next source occurrence rather than creating duplicates; preserve project/category/priority fields.
- [x] Guard concurrent completion at the database boundary; test complete/reopen/complete, inherited project and undo behavior.

## Task 3 — Recoverable backups (worker ownership)
- [x] Keep replacement logic focused in the Rust command layer with real filesystem tests.
- [x] Stage new files, preserve originals, journal progress, commit replacements, rollback on failure and recover after restart. No mixed main/course generations after handled failure.
- [x] Publish backup exports only after all participating snapshots succeed; fail visibly on participant snapshot failure.
- [x] Validate simulated course file lock and replacement failure; document full Tauri validation limitations.

## Task 4 — Extensible lifecycle (worker ownership)
- [x] Public extension SDK and additive API v1 capabilities: scoped disposables and event subscription.
- [x] Host rejects duplicate IDs/routes and cleans resources after activation failure and disable; serializes per-extension enable/disable.
- [x] Keep existing course/workflow modules compatible and test contribution isolation rules.
- [x] Document extension authoring and version evolution. Do not claim untrusted plugin execution isolation.

## Task 5 — UI consistency and usable core layout (worker ownership)
- [x] Scope sidebar CSS so it cannot override task columns; preserve collapse behavior in every layout mode.
- [x] Make monthly planning and statistics use the available content width; centralize content width styles.
- [x] Improve Today task title space and on-demand detail, using existing tokens.
- [x] Implement consistent modal focus management and reduced-motion settings without disrupting forms.
- [x] Refine Focus and Settings hierarchy; keep existing functionality and test hooks intact.

## Task 6 — Honest statistics (main agent)
- [x] Keep completed-in-range and created-cohort counts explicitly named; label the latter's completion rate accurately instead of conflating it with today's plan.
- [x] Only compare estimates for tasks with recorded duration; report number of tasks missing time records.
- [x] Cover untracked completed tasks and existing cross-date task creation/completion behavior.

## Task 7 — Integration and delivery
- [x] Run baseline and new tests using a sandbox-compatible execution configuration; run tsc and Rust tests. Production build attempted and recorded as sandbox-blocked at esbuild process spawn.
- [x] Perform spec and code-quality review of combined changes; fix discovered issues.
- [x] Export unified patch, changed source files, validation notes and extension guide to outputs; integrate the verified change set into the original repository.
