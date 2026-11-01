import { readFileSync } from "node:fs";
import { readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import type { PluginServerContext } from "@getpaseo/plugin/server";
import { registerExplorerVerb, unregisterExplorerVerb } from "./server/explorer-verb";
import { RequestQueue } from "./server/queue";
import { stopReason } from "./server/stop-reason";
import { nextOpenRequestRpc } from "./shared/contracts";

// Plugin RPCs time out at 30s; the client re-polls right away
const LONG_POLL_MS = 20_000;
// NOTE: must match paseo-plugin.json; uninstall cleanup looks for this config entry
const PLUGIN_ID = "open-with-paseo";
// Paseo updates config.json just after asking the plugin to stop
const CONFIG_SETTLE_MS = 300;

export default function contribute(server: PluginServerContext) {
  // The daemon exports PASEO_HOME to its plugin processes; ~/.paseo is its own default
  const home = path.resolve(process.env.PASEO_HOME?.trim() || path.join(os.homedir(), ".paseo"));
  const serverId = process.env.PASEO_SERVER_ID?.trim() || readFileSync(path.join(home, "server-id"), "utf8").trim();
  const dataDirectory = path.join(home, "open-with-paseo");
  const requestDirectory = path.join(dataDirectory, "requests");
  const queue = new RequestQueue(requestDirectory);

  server.handle(nextOpenRequestRpc, async () => {
    const request = await queue.next(LONG_POLL_MS);
    return { request: request ? { path: request.path, serverId } : null };
  });

  if (process.platform === "win32") {
    // Plugin processes run on the desktop app's executable when the app manages the daemon
    const paseoExecutable = path.basename(process.execPath).toLowerCase() === "paseo.exe" ? process.execPath : null;
    registerExplorerVerb({
      launcherPath: path.join(dataDirectory, "open-with-paseo.ps1"),
      requestDirectory,
      paseoExecutable,
    }).catch((error: unknown) => console.error("[open-with-paseo] Could not register the Explorer menu entry", error));
  }

  return async () => {
    queue.close();
    if (process.platform !== "win32") return;
    // Removal and disabling drop the menu entry, which nothing would answer; removal also drops the
    // launcher and request folder. Reloads, updates, and shutdowns keep both.
    await sleep(CONFIG_SETTLE_MS);
    let configText: string;
    try {
      configText = await readFile(path.join(home, "config.json"), "utf8");
    } catch {
      return;
    }
    const reason = stopReason(configText, PLUGIN_ID);
    if (reason === null) return;
    await unregisterExplorerVerb();
    if (reason === "removed") await rm(dataDirectory, { recursive: true, force: true });
  };
}
