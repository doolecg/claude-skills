package YOUR.PACKAGE.selftest;

import net.minecraft.server.MinecraftServer;

import java.util.ArrayDeque;
import java.util.Deque;
import java.util.function.BooleanSupplier;

/**
 * Env-gated in-game server self-test (set MODID_SELFTEST=1 before starting the server; MODID_SELFTEST_QUIT=1 to
 * stop the server when done). Steps run one pass per SERVER TICK, driven from the mod's own tick event
 * (Fabric ServerTickEvents.END_SERVER_TICK, NeoForge ServerTickEvent.Post) so waiting for chunks and light works.
 *
 * Pitfall: do NOT make a step re-queue itself with server.execute(...). That keeps the main thread's task queue
 * permanently non-empty, starves the chunk/light task loop, and the test then waits forever for chunks.
 * Waiting is a boolean polled once per tick, as below.
 *
 * Results: write them to a file in the server dir and log them; exit non-zero if a check failed so scripts notice.
 */
public final class ServerSelfTest {
    interface Step { boolean run() throws Exception; }   // true = done, false = call again next tick

    private static final Deque<Step> STEPS = new ArrayDeque<>();
    private static boolean started, failed;

    public static void maybeStart(MinecraftServer server) {   // call from SERVER_STARTED
        String mode = System.getenv("MODID_SELFTEST");
        if (started || mode == null || mode.isBlank() || mode.equals("0")) return;
        started = true;
        STEPS.add(() -> { /* set up: forceload chunks, run commands: server.getCommands().performPrefixedCommand(...) */ return true; });
        STEPS.add(waitUntil(2400, () -> true /* chunks loaded */));
        STEPS.add(() -> { check("example", 1 + 1 == 2); return true; });
    }

    public static void tick(MinecraftServer server) {          // call from the server tick event
        if (!started) return;
        try {
            while (!STEPS.isEmpty() && STEPS.peek().run()) STEPS.poll();   // finished steps chain in the same tick
        } catch (Exception e) {
            e.printStackTrace();
            failed = true;
            STEPS.clear();
        }
        if (started && STEPS.isEmpty()) {
            started = false;
            System.out.println("[selftest] " + (failed ? "FAILED" : "passed"));
            if ("1".equals(System.getenv("MODID_SELFTEST_QUIT"))) {
                server.halt(false);   // saves and stops; the run task then exits
            }
        }
    }

    private static Step waitUntil(int maxTicks, BooleanSupplier cond) {
        int[] waited = {0};
        return () -> {
            if (cond.getAsBoolean()) return true;
            if (++waited[0] > maxTicks) throw new IllegalStateException("timed out waiting");
            return false;
        };
    }

    private static void check(String name, boolean ok) {
        if (!ok) failed = true;
        System.out.println("[selftest] " + (ok ? "ok   " : "FAIL ") + name);
    }
}
