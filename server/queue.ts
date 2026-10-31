import { type FSWatcher, mkdirSync, watch } from "node:fs";
import { readdir, readFile, rm } from "node:fs/promises";
import path from "node:path";

/**
 * A request this old was queued while no Paseo window was polling (Paseo starting, or the plugin
 * off); opening it later would surprise. Cold start of the desktop app fits well inside.
 */
export const MAX_REQUEST_AGE_MS = 120_000;

export interface QueuedRequest {
  /** Absolute directory */
  path: string;
}

/** The launcher writes `{ path, requestedAt }`; anything else, stale, or relative is dropped */
export function parseRequest(text: string, now: number): QueuedRequest | null {
  let value: unknown;
  try {
    value = JSON.parse(text.replace(/^\uFEFF/, ""));
  } catch {
    return null;
  }
  if (typeof value !== "object" || value === null) return null;
  const { path: directory, requestedAt } = value as { path?: unknown; requestedAt?: unknown };
  if (typeof directory !== "string" || !path.isAbsolute(directory)) return null;
  if (typeof requestedAt !== "number" || now - requestedAt > MAX_REQUEST_AGE_MS) return null;
  return { path: directory };
}

/**
 * Takes the oldest usable request out of `directory`, deleting every file it reads (used, stale,
 * or malformed). File names start with a fixed-width millisecond timestamp, so name order is
 * arrival order. Only `*.json` counts: the launcher writes `*.tmp` and renames it into place.
 */
export async function claimNextRequest(directory: string, now = Date.now()): Promise<QueuedRequest | null> {
  let names: string[];
  try {
    names = (await readdir(directory)).filter((name) => name.endsWith(".json")).sort();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
  for (const name of names) {
    const file = path.join(directory, name);
    let text: string;
    try {
      text = await readFile(file, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
      throw error;
    }
    await rm(file, { force: true });
    const request = parseRequest(text, now);
    if (request) return request;
  }
  return null;
}

/** Hands each queued request to exactly one long-poll waiter */
export class RequestQueue {
  private readonly waiters = new Set<() => void>();
  private readonly watcher: FSWatcher;
  // Claims run one at a time so two waiters never read the same file
  private claims: Promise<unknown> = Promise.resolve();
  private closed = false;
  private readonly directory: string;

  constructor(directory: string) {
    this.directory = directory;
    mkdirSync(directory, { recursive: true });
    this.watcher = watch(directory, () => this.wakeAll());
    this.watcher.on("error", (error) => console.error("[open-with-paseo] Request folder watch failed", error));
  }

  /** The next request, or null once `timeoutMs` passes (or the queue closes) without one */
  async next(timeoutMs: number): Promise<QueuedRequest | null> {
    const deadline = Date.now() + timeoutMs;
    while (!this.closed) {
      const request = await this.claim();
      if (request) return request;
      const remaining = deadline - Date.now();
      if (remaining <= 0 || this.closed) return null;
      const { promise, resolve } = Promise.withResolvers<void>();
      const wake = () => {
        clearTimeout(timer);
        this.waiters.delete(wake);
        resolve();
      };
      const timer = setTimeout(wake, remaining);
      this.waiters.add(wake);
      await promise;
    }
    return null;
  }

  close(): void {
    this.closed = true;
    this.watcher.close();
    this.wakeAll();
  }

  private claim(): Promise<QueuedRequest | null> {
    const claim = this.claims.then(() => claimNextRequest(this.directory));
    this.claims = claim.catch(() => undefined);
    return claim;
  }

  private wakeAll(): void {
    for (const wake of [...this.waiters]) wake();
  }
}
