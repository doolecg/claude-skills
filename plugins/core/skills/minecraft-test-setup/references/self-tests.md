# Env-gated server self-tests and headless runs

Pattern (template: templates/ServerSelfTest.java): `MODID_SELFTEST` selects a mode, `MODID_SELFTEST_QUIT=1` stops
the server when finished. Steps run one pass per server tick; each returns true when done or false to run again
next tick (`waitUntil(maxTicks, cond)` throws on timeout). Results go to a text file in the server directory and
the log; report failures clearly so scripts notice.

Do not re-queue a task with `server.execute` from a server-thread task: it starves chunk/light loading and the
test never sees chunks load. Drive from the mod's server tick event.

Headless server run:
1. `python scripts/seed_config.py eula <run dir>` and `... server <run dir>` (whitelist off, peaceful, creative).
2. `MODID_SELFTEST=1 MODID_SELFTEST_QUIT=1 ./gradlew :fabric:runServer` (or `:neoforge:runServer`, `:paper:runServer`).
   Inside Operant use `operant test "<cmd>"` and `operant wait <id> --errors`.
3. Read the result file and `run/logs/latest.log`. Persistence tests use two modes (write and stop, then read after
   restart), recording state in a file between runs.

Client-side key- or screen-driven self-tests: see pitfalls.md (pauseOnLostFocus, stray input, logging the current screen).
