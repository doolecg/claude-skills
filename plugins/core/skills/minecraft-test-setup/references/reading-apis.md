# Reading Minecraft 26.x / NeoForge APIs

No decompiler needed for signatures.

- Fabric/Loom 26.x merged jar: `~/.gradle/caches/fabric-loom/minecraftMaven/net/minecraft/minecraft-merged-deobf/<v>/*.jar`
  (already mojmap-named; unobfuscated 26.x needs no mappings).
- `~/.jdks/temurin-26.0.2.1/bin/javap -classpath <jar> -p net.minecraft.client.Screenshot`. Use the JDK 26 javap;
  older ones fail on new class-file versions. `-p` shows private members, `-c` bytecode.
- Find a class: `unzip -l <jar> | grep -i Screenshot`. Find who uses a method: `javap -c -p` over a few classes, grep.
- NeoForge sources: `~/.gradle/caches/modules-2/files-2.1/net.neoforged/neoforge/<v>/**/neoforge-<v>-sources.jar`;
  read a file with `unzip -p <sources> path/File.java`.
- The jar's `version.json` (`unzip -p <jar> version.json`) has `pack_version` (`data_major` on 26.x) for datapacks.
