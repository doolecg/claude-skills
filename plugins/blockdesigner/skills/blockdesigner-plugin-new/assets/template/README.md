<p align="center">
  <img src="docs/images/logo.png" alt="BlockDesigner logo" width="128" height="128">
</p>

<h1 align="center">{{NAME}}</h1>

<p align="center">
  {{TAGLINE}}
</p>

<p align="center">
  <a href="https://github.com/doolecg/{{REPO}}/releases/latest"><img alt="Latest release" src="https://img.shields.io/github/v/release/doolecg/{{REPO}}?label=release"></a>
  <a href="https://github.com/doolecg/{{REPO}}/releases"><img alt="Downloads" src="https://img.shields.io/github/downloads/doolecg/{{REPO}}/total"></a>
  <a href="LICENSE"><img alt="License: MIT" src="https://img.shields.io/github/license/doolecg/{{REPO}}"></a>
  <img alt="Platform: Windows" src="https://img.shields.io/badge/platform-Windows-0078D6">
  <a href="https://github.com/doolecg/BlockDesigner"><img alt="BlockDesigner plugin API {{API}}" src="https://img.shields.io/badge/BlockDesigner-plugin%20API%20{{API}}-46C46E"></a>
</p>

---

{{NAME}} is a plugin for [BlockDesigner](https://github.com/doolecg/BlockDesigner), the Windows editor for Minecraft builds. It is released
on its own, separately from the app. It needs **BlockDesigner {{MIN_APP}} or later** (plugin API {{API}}).

**Contents:** [Download](#download-and-install) · [Features](#features) · [Building from source](#building-from-source) · [Project layout](#project-layout)

## Download and install

Get the latest version from the [releases page](https://github.com/doolecg/{{REPO}}/releases/latest):

1. Download `{{ID}}-<version>.jar`.
2. In BlockDesigner open **Plugins (puzzle icon) › Manage plugins… › Install…** and pick the jar.

It is on straight away, with its own tab on the right. You can switch it off, reload or uninstall it in the same window, and it
updates itself (Plugins › Manage plugins… › Update plugins automatically). Plugins run with the same access as BlockDesigner itself, so only install
ones you trust.

## Features

### What it adds

- **Feature:** what the user can do with it, and where to find it (Plugins menu, the plugin's tab, a tool, a `/command`).

## Building from source

You need Windows and a JDK 26 (Temurin 26 is what BlockDesigner uses; set `org.gradle.java.home` in
`gradle.properties` to yours). Then:

```
./gradlew jar      # build/libs/{{ID}}-<version>.jar
```

The plugin compiles against the BlockDesigner plugin API jars in [`libs/`](libs) (from BlockDesigner {{APP_VERSION}}). The app
provides them, Jackson and JavaFX at runtime, so they are never bundled into the plugin. To target a newer API, replace them
with the jars from a newer BlockDesigner build (`./gradlew :plugin-api:jar :core:jar` in the
[BlockDesigner repository](https://github.com/doolecg/BlockDesigner)) and update the file names in `build.gradle.kts`.

The version is set in `build.gradle.kts` and copied into the jar's `blockdesigner-plugin.json`. To release a new
version, change it there, add a section to [RELEASE_NOTES.md](RELEASE_NOTES.md), build the jar and attach it to a
GitHub release tagged with the version.

For writing plugins, see BlockDesigner's [plugin guide](https://github.com/doolecg/BlockDesigner/blob/main/PLUGINS.md) and
[API reference](https://github.com/doolecg/BlockDesigner/blob/main/docs/plugin-api-reference.md).

### Tests

```
./gradlew test
```

The tests cover the plugin's logic that runs without the app, against the API jars in `libs/`.

## Project layout

| Path | What it does |
|---|---|
| `src/main/java` | The plugin's code: `{{CLASS}}` (the entry point) |
| `src/main/resources/blockdesigner-plugin.json` | The manifest BlockDesigner reads: id, name, version, main class, API level |
| `src/test/java` | Tests |
| `libs/` | The BlockDesigner plugin API jars it compiles against |

## License

[MIT](LICENSE)
