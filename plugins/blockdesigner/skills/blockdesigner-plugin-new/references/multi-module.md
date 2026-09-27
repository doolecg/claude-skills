# Multi-module variant (like BlockDesigner-TerrainGenerator)

Use it when part of the plugin is plain Java that should not depend on BlockDesigner at all (a generator, a file
format, an algorithm you may reuse elsewhere) and you want that separation enforced by the build. For everything
else the single-module template is simpler; start there and split later if needed.

## Layout

```
BlockDesigner-<Name>/
  build.gradle.kts          root: version, shared repos, and a `jar` task that copies the plugin jar to build/libs
  settings.gradle.kts       rootProject.name = "<id>"; include("runtime", "plugin")
  gradle.properties, gradle/libs.versions.toml, gradlew*, gradle/wrapper/   (same as the template)
  libs/                     the vendored API jars, shared by the modules (rootProject.files(...))
  runtime/                  plain Java, no BlockDesigner dependency (Terrain Generator targets release 17)
  plugin/                   the BlockDesigner plugin; builds the runtime's classes into its jar
    src/main/resources/blockdesigner-plugin.json
```

## Root `build.gradle.kts`

The version must stay a **column-0** `version = "x.y.z"` line in the root file: `publish_plugin.py` and
`bump_plugins.py` read it with `^version = "…"`, and the subprojects inherit it.

```kotlin
// <Name>, a BlockDesigner plugin released on its own. Build it with:  ./gradlew jar
// then install build/libs/<id>-<version>.jar with Plugins > Manage plugins > Install.
version = "0.1.0"

subprojects {
    group = "io.blockdesigner.plugins"
    version = rootProject.version

    repositories {
        mavenCentral()
    }
}

// The plugin jar is copied to build/libs too, where releases are taken from (like the other plugin repositories).
tasks.register<Copy>("jar") {
    description = "Builds the plugin jar into build/libs."
    from(project(":plugin").tasks.named("jar"))
    into(layout.buildDirectory.dir("libs"))
}
```

The root `jar` task matters: `publish_plugin.py` uploads `<root>/build/libs/<rootProject.name>-<version>.jar`. Without
the copy the jar only exists in `plugin/build/libs/` and the publisher stops with "Missing … run ./gradlew jar first".
`./gradlew jar` at the root runs every project's `jar` task, including this one.

## `plugin/build.gradle.kts` (differences from the single-module template)

```kotlin
base {
    archivesName = "<id>"            // so the jar is <id>-<version>.jar, the name the updater prefers
}

// The BlockDesigner API this plugin targets (from BlockDesigner 0.4.22).
val blockDesigner = rootProject.files("libs/blockdesigner-plugin-api-0.4.22.jar", "libs/blockdesigner-core-0.4.22.jar")

dependencies {
    implementation(project(":runtime"))
    compileOnly(blockDesigner)
    testImplementation(blockDesigner)
    // junit, assertj as in the template
}

// One jar: the plugin plus the runtime's classes and resources.
tasks.jar {
    dependsOn(":runtime:jar")
    from(project(":runtime").sourceSets.main.get().output)
}
```

Keep the `processResources` `@VERSION@` filter in the plugin module (the manifest lives there).

## `runtime/build.gradle.kts`

`java-library`, toolchain 26, `options.release` as low as you like (17 in Terrain Generator), no BlockDesigner jars,
tests with junit/assertj. Nothing from `io.blockdesigner.core` or `io.blockdesigner.plugin` may be used here.

## A jar-content test worth copying

Terrain Generator checks the built jar holds the manifest, the plugin class and the runtime, and nothing from
BlockDesigner itself (`plugin/src/test/java/.../PluginPartsTest.java`, `theJarHoldsThePluginTheRuntimeAndThePresets`):

```java
assertThat(j.stream().map(e -> e.getName()))
        .noneMatch(n -> n.startsWith("io/blockdesigner/core/") || n.startsWith("io/blockdesigner/plugin/"));
```

## Things the helper scripts assume

- `bump_plugins.py` finds the manifest anywhere in the repo (`plugin/src/main/resources/…` is fine), and replaces the
  old API version in every `*.kts` / `*.properties` / `*.toml` file and `README.md`, so `plugin/build.gradle.kts` is
  covered.
- `publish_plugin.py` reads `version` from the root `build.gradle.kts` and `rootProject.name` from
  `settings.gradle.kts`.
