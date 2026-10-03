package YOUR.PACKAGE.client;

import net.minecraft.client.Minecraft;
import net.minecraft.client.Screenshot;

import java.util.ArrayList;
import java.util.List;

/**
 * Dev-only screenshot run: no F2, no clicking, no window focus needed. Active only when MODID_CLIENT_SHOTS is set in
 * the environment. Once in a world it runs a camera command per shot, waits, saves screenshots/<modid>-<name>.png,
 * and quits. Call ClientShots.tick(mc) from the mod's client tick event (Fabric END_CLIENT_TICK, NeoForge
 * ClientTickEvent.Post). Names below are 26.x (mojmap); on 1.21.x Screenshot.grab takes
 * (File gameDir, String name, RenderTarget, Consumer<Component>) and mc.getMainRenderTarget() instead of
 * gameRenderer.mainRenderTarget() (check with javap, see references/reading-apis.md).
 */
final class ClientShots {
    private static final boolean ENABLED = System.getenv("MODID_CLIENT_SHOTS") != null;
    private static final int SETTLE_TICKS = 200;  // let chunks, light and the shader pipeline warm up
    private static final int SHOT_TICKS = 60;     // let the camera move and chunks re-render per shot

    private record Shot(String name, String command, Runnable before) { }

    private static final List<Shot> SHOTS = new ArrayList<>();
    private static int index = -1;
    private static int wait;

    static {
        // sendCommand runs as the player: needs commands allowed (creative test world has them). No leading slash.
        SHOTS.add(new Shot("overview", "tp @s 0.5 -55 -10 0 22", null));
        SHOTS.add(new Shot("closeup", "tp @s 4.5 -58 -3 facing 6 -58 0", null));
        // A shot of a screen: SHOTS.add(new Shot("config", "tp @s 0 -55 0", () -> Minecraft.getInstance().gui.setScreen(MyScreen.create(null))));
    }

    static void tick(Minecraft mc) {
        if (!ENABLED || mc.player == null || mc.level == null) return;
        if (index < 0) {
            if (++wait < SETTLE_TICKS) return;
            mc.player.connection.sendCommand("time set noon");
            mc.player.connection.sendCommand("weather clear");
            index = 0;
            wait = 0;
            begin(mc, SHOTS.get(0));
            return;
        }
        if (index >= SHOTS.size() || ++wait < SHOT_TICKS) return;
        Shot s = SHOTS.get(index);
        Screenshot.grab(mc.gameDirectory, "modid-" + s.name() + ".png", mc.gameRenderer.mainRenderTarget(), 1,
                msg -> System.out.println("Client shots: " + msg.getString()));
        mc.gui.setScreen(null);
        index++;
        wait = 0;
        if (index < SHOTS.size()) begin(mc, SHOTS.get(index));
        else {
            System.out.println("Client shots: done");
            mc.stop();
        }
    }

    private static void begin(Minecraft mc, Shot s) {
        mc.player.connection.sendCommand(s.command());
        if (s.before() != null) s.before().run();
    }

    private ClientShots() { }
}
