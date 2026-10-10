---
name: learn-real-test
description: Run Operant's self-learning loop for real, once, against the real Haiku model, and show the Right now card's learning line while it runs. Use when the user says "show me the self learning", "test learning for real", "run the real learn test", or after changing core/learn.ts or the learning settings.
---

# Real learn test (dev only)

Runs one learn pass on a made-up session in a throwaway project and profile. It calls the real `claude` CLI (Haiku 5.5, a few cents), so it is not part of `npm test` or CI.

## Run

1. `npm run build` (the script launches the built app from `out/`).
2. `node .claude/skills/learn-real-test/run.mjs [outDir]` from the repo root. `outDir` defaults to `docs/specs/screenshots`.

It uses `OPERANT_BACKGROUND=1` (no focus stealing), a throwaway `OPERANT_DATA_DIR`, and a throwaway `CLAUDE_CONFIG_DIR` holding a copy of `~/.claude/.credentials.json` (deleted at the end). It never touches the real `~/.claude`. Hindsight and CodeGraph are switched off.

## What it prints and saves

- The AI used, the run record (extracted / written / queued / skipped), each lesson with its status, the change records, and the memory files written.
- `learn-card-running.png` (the Right now card's learning line while the run is in flight) and `learn-card-done.png`, in `outDir`.

## Expect

- The made-up session has four user turns and three corrections (pnpm not npm, tests in `tests/`, no semicolons, plain commits). About six lessons come back; low-risk ones apply, ones that name commands or conventions wait for review.
- An error starting `Skipped:` means the trivial-session gate fired: check `minUserTurns` / `minTokens` in `shared/learn.ts` against the 12,000-character transcript tail in `core/learn.ts`.

Max 3 runs per problem, then stop and ask.
