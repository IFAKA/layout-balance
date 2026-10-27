import { test } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { parseSnapshot } from "../src/ios.js";

// A real accessibility tree from Safari in the iOS Simulator (iPhone 17, points).
const tree = JSON.parse(readFileSync(new URL("./ios/safari.json", import.meta.url)));

test("ios: the snapshot becomes leaves in pixels, only what is on screen", () => {
  const d = parseSnapshot(tree, 3);
  assert.equal(d.W, 1206);
  assert.ok(d.leaves.some((l) => l.kind === "text" && l.y < d.H), "text found");
  assert.ok(d.leaves.every((l) => l.y < 2622 && l.y + l.h > 0), "nothing below the screen is kept");
  assert.ok(d.leaves.every((l) => l.w > 1 && l.h > 1));
});
