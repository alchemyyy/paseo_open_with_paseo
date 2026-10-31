import { readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { PluginServerContext } from "@getpaseo/plugin/server";
import { registerExplorerVerb } from "./server/explorer-verb";
import { RequestQueue } from "./server/queue";
import { nextOpenRequestRpc } from "./shared/contracts";

// Plugin RPCs time out at 30s; the client re-polls right away
const LONG_POLL_MS = 20_000;

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

  return () => queue.close();
}
