import test from "node:test";
import assert from "node:assert/strict";
import { evaluate } from "../src/index.js";
import { loadConfig } from "../src/index.js";

const rules = loadConfig().rules;
const data = (leaves, extra = {}) => ({ W: 1000, H: 600, headerBottom: 50, hscroll: false, leaves, ...extra });
const t = (x, y, w, h) => ({ kind: "text", x, y, w, h, fixed: false, tag: "p" });

test("sideways scroll fails", () => {
  const f = evaluate({ data: data([], { hscroll: true }), weight: null, fit: false }, rules);
  assert.equal(f[0].rule, "overflow-x");
});
test("two blocks 2px apart fail min-gap", () => {
  const f = evaluate({ data: data([t(100, 100, 300, 40), t(100, 142, 300, 40)]), weight: null, fit: false }, rules);
  assert.ok(f.some((x) => x.rule === "min-gap"));
});
test("weight far to the left fails centre-x", () => {
  const f = evaluate({ data: data([t(300, 200, 400, 100)]), weight: { empty: false, dx: -0.2, dy: 0 }, fit: true }, rules);
  assert.ok(f.some((x) => x.rule === "centre-x"));
});
test("text cut by the fold fails", () => {
  const f = evaluate({ data: data([t(300, 560, 400, 80)]), weight: null, fit: true }, rules);
  assert.ok(f.some((x) => x.rule === "fold-cut"));
});
