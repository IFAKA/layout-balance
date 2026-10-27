import test from "node:test";
import assert from "node:assert/strict";
import { evaluate, plan, loadConfig } from "../src/index.js";

const rules = loadConfig().rules;
const run = (leaves) => {
  const data = { W: 1000, H: 600, headerBottom: 0, hscroll: false, leaves };
  const f = evaluate({ data, weight: null, fit: true }, rules);
  return { f, p: plan({ data, weight: null, fit: true }, rules, f) };
};
const L = (kind, x, y, w, h, sel) => ({ kind, x, y, w, h, fixed: false, tag: "div", sel });

test("a balanced screen has an empty plan", () => {
  const { f, p } = run([L("text", 300, 150, 400, 60, "h1"), L("media", 350, 230, 300, 200, "img")]);
  assert.equal(f.length, 0);
  assert.deepEqual(p.steps, []);
});
test("a too-tall picture gets a max height and the plan passes the geometry rules", () => {
  const { p } = run([L("text", 300, 20, 400, 60, "h1"), L("media", 300, 90, 400, 510, "img.hero")]);
  const s = p.steps.find((x) => x.rule === "dominance");
  assert.ok(s && s.target === "img.hero" && /max-height/.test(s.css));
  assert.equal(p.predicted, "pass");
});
test("text on the edge gets side padding", () => {
  const { p } = run([L("text", 2, 200, 300, 60, "p")]);
  assert.ok(p.steps.some((x) => x.rule === "edge-touch" && /16px/.test(x.css)));
});
test("same input gives the same plan", () => {
  const a = run([L("text", 300, 20, 400, 60, "h1"), L("media", 300, 90, 400, 510, "img")]);
  const b = run([L("text", 300, 20, 400, 60, "h1"), L("media", 300, 90, 400, 510, "img")]);
  assert.deepEqual(a.p, b.p);
});
