# Screenshots without focus or clicking

Goal: capture mod visuals at 1920x1080, GUI scale 2, Bare Bones + Complementary, without touching the user's windows.

## Preferred: in-mod driver (templates/ClientShots.java)
Env-gated. Once in the world it sends `tp`/`time`/`weather` commands, optionally `setScreen`, calls
`Screenshot.grab(mc.gameDirectory, name, mainRenderTarget, 1, cb)` and `mc.stop()`. Files land in
`<run>/screenshots/`. No F2, no OS-level input, works with the window behind others.

Run: seed config, install visuals, make the test world with the demo scene, start the focus guard, then
`MODID_CLIENT_SHOTS=1 ./gradlew :fabric:runClient --args="--quickPlaySingleplayer <world>"`
(the window size comes from loom `programArgs '--width','1920','--height','1080'`; `overrideWidth:1920` /
`overrideHeight:1080` in options.txt is a backstop). Wait for `Client shots: done` in the log, then Read each PNG
and send them with SendUserFile (the user is usually remote).

## Demo scene
`scripts/make_datapack.py <save> <name> <build.mcfunction> <mc jar>` writes a datapack that rebuilds a scene on
every world load through `data/minecraft/tags/function/load.json`. Use `fill`/`setblock` only so it is idempotent,
and clear the area first. A superflat world keeps coordinates stable. Place the camera with
`tp @s x y z yaw pitch` or `tp @s x y z facing x y z`.

## Focus guard (scripts/background.ps1)
Start it BEFORE launching the game, as its own background process (keep the PID):
`powershell -NoProfile -ExecutionPolicy Bypass -File "<skill dir>/scripts/background.ps1"`.
It remembers the foreground window, polls for a java/javaw window titled `Minecraft*` that took foreground, sends
it to the bottom without activating it and returns focus to the previous window. It exits after 6 minutes; stop it
by PID if done sooner.

## Fallbacks
- A window grab (`gui.ps1 shot`, see the BlockDesigner wiki) needs the window visible and on top: only when the
  user is not working, or on request.
- Promo sets (many scenes, every screen): a dedicated mode like BlockCompanion's `PromoShots` follows the same
  pattern with a copied world, `overrideWidth/Height` 1920x1080, and F1 toggled via `keyToggleGui` on 26.x.
