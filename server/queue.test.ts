import assert from "node:assert/strict";
import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { claimNextRequest, MAX_REQUEST_AGE_MS, RequestQueue } from "./queue.ts";

const folder = path.resolve("some-folder");

async function withDirectory(run: (directory: string) => Promise<void>): Promise<void> {
  const directory = await mkdtemp(path.join(os.tmpdir(), "open-with-paseo-"));
  try {
    await run(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

function requestFile(directory: string, requestedAt: number, suffix = "a"): Promise<void> {
  const name = `${String(requestedAt).padStart(13, "0")}-${suffix}.json`;
  return writeFile(path.join(directory, name), JSON.stringify({ path: folder, requestedAt }));
}

test("claimNextRequest: oldest fresh request wins and every file it reads is consumed", async () => {
  await withDirectory(async (directory) => {
    const now = Date.now();
    await writeFile(path.join(directory, "0000000000001-garbage.json"), "not json");
    await requestFile(directory, now - MAX_REQUEST_AGE_MS - 1, "stale");
    await writeFile(
      path.join(directory, `${now - 2000}-old.json`),
      `\uFEFF${JSON.stringify({ path: path.resolve("first"), requestedAt: now - 2000 })}`,
    );
    await requestFile(directory, now - 1000, "new");
    // Still being written by the launcher; must not be read
    await writeFile(path.join(directory, `${now - 3000}-partial.tmp`), "{");

    assert.deepEqual(await claimNextRequest(directory, now), { path: path.resolve("first") });
    assert.deepEqual((await readdir(directory)).sort(), [`${now - 3000}-partial.tmp`, `${now - 1000}-new.json`]);
    assert.deepEqual(await claimNextRequest(directory, now), { path: folder });
    assert.equal(await claimNextRequest(directory, now), null);
  });
});

test("claimNextRequest: a relative path is rejected", async () => {
  await withDirectory(async (directory) => {
    await writeFile(path.join(directory, "x.json"), JSON.stringify({ path: "relative\\dir", requestedAt: Date.now() }));
    assert.equal(await claimNextRequest(directory), null);
  });
});

test("RequestQueue: a waiting poll wakes for a new request, and only one of two waiters gets it", async () => {
  await withDirectory(async (directory) => {
    const queue = new RequestQueue(directory);
    try {
      const first = queue.next(2_000);
      const second = queue.next(300);
      // Real fs.watch on a real folder: the file must land after both polls are parked
      setTimeout(() => void requestFile(directory, Date.now()), 50);
      const results = await Promise.all([first, second]);
      assert.equal(results.filter((result) => result?.path === folder).length, 1);
      assert.equal(results.filter((result) => result === null).length, 1);
    } finally {
      queue.close();
    }
  });
});

test("RequestQueue: close releases a waiting poll with null", async () => {
  await withDirectory(async (directory) => {
    const queue = new RequestQueue(directory);
    const waiting = queue.next(10_000);
    queue.close();
    assert.equal(await waiting, null);
  });
});
