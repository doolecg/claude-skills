# {{NAME}}: plan

> **Status ({{DATE}}):** planned, nothing built yet.

## Context

What the user asked for, in their words, and what they chose when asked (modes, limits, what can wait).

This plugin lives in its own repository, `F:/PROGRAMMING/REPOS/{{REPO}}` (GitHub `doolecg/{{REPO}}`), never in
BlockDesigner's main repository. It compiles against the vendored API jars from BlockDesigner {{APP_VERSION}} and
declares `"api": {{API}}`.

## What the existing API already gives us (reuse, don't rebuild)

| Need | Existing API |
|---|---|
| | |

## Gaps in the API

Anything the plugin needs that the API doesn't have. Each gap is a change to BlockDesigner (a new API level) that ships
with an app release first; the plugin then moves to the new jars and raises its `api` and "Needs" line.

## Phases

1. **Scaffold:** the repository, manifest, an empty tab, tests running.
2. ...

## Tests

What is tested without the app (pure logic against the jars in `libs/`), and what can only be checked by hand in the app.
