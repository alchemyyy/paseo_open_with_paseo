import assert from "node:assert/strict";
import { test } from "node:test";
import { stopReason } from "./stop-reason.ts";

const ID = "open-with-paseo";
const config = (value: unknown) => JSON.stringify(value);
const entry = { source: "directory", path: "C:\\plugins\\open-with-paseo", enabled: true };

test("A removed plugin has no config entry left", () => {
  assert.equal(stopReason(config({ pluginsEnabled: true, plugins: { other: entry } }), ID), "removed");
  assert.equal(stopReason(config({ pluginsEnabled: true }), ID), "removed");
});

test("Disabling the plugin or every plugin counts as disabled", () => {
  assert.equal(stopReason(config({ pluginsEnabled: true, plugins: { [ID]: { ...entry, enabled: false } } }), ID), "disabled");
  assert.equal(stopReason(config({ pluginsEnabled: false, plugins: { [ID]: entry } }), ID), "disabled");
});

test("Reloads, updates, and daemon shutdowns leave the entry enabled and keep the menu entry", () => {
  assert.equal(stopReason(config({ pluginsEnabled: true, plugins: { [ID]: entry } }), ID), null);
  // An unreadable config is no evidence of removal
  assert.equal(stopReason("{ not json", ID), null);
  assert.equal(stopReason(config({ plugins: [] }), ID), null);
});
