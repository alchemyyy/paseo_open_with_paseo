import type { PluginClientContext } from "@getpaseo/plugin/client";
import { nextOpenRequestRpc, type OpenRequest } from "./shared/contracts";

const RETRY_MS = 3_000;

declare global {
  interface Window {
    /** The desktop app's preload bridge; absent in the web and mobile clients */
    paseoDesktop?: unknown;
  }
}

/**
 * Routes through the app's own router: its web history listener turns a popstate into
 * navigation. `open=draft:new` is the app's "new chat" tab intent; the workspace screen mints a
 * fresh draft for it.
 */
function openNewChat(serverId: string, workspaceId: string): void {
  const route = `/h/${encodeURIComponent(serverId)}/workspace/${encodeURIComponent(workspaceId)}?open=${encodeURIComponent("draft:new")}`;
  window.history.pushState(window.history.state, "", route);
  window.dispatchEvent(new PopStateEvent("popstate", { state: window.history.state }));
  window.focus();
}

async function handleRequest(client: PluginClientContext, request: OpenRequest): Promise<void> {
  // Finds the folder's workspace, or creates it (and its project); also restores an archived one
  const workspace = await client.paseo.workspaces.open(request.path);
  openNewChat(request.serverId, workspace.id);
}

export default function contribute(client: PluginClientContext) {
  // Explorer runs on the desktop; a phone or browser connected to the same daemon must not take requests
  if (typeof window === "undefined" || !window.paseoDesktop) return () => {};
  let stopped = false;
  void (async () => {
    while (!stopped) {
      try {
        const { request } = await client.rpc(nextOpenRequestRpc, {});
        if (request && !stopped) await handleRequest(client, request);
      } catch (error) {
        if (stopped) return;
        console.error("[open-with-paseo] Opening a folder from Explorer failed", error);
        const { promise, resolve } = Promise.withResolvers<void>();
        setTimeout(resolve, RETRY_MS);
        await promise;
      }
    }
  })();
  return () => {
    stopped = true;
  };
}
