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

// --- rules that know which box holds which piece ---
const tx = (x, y, w, h, parent, extra = {}) => ({ kind: "text", x, y, w, h, fixed: false, tag: "p", block: true, parent, box: -1, chars: 20, lineH: h, align: "start", ext: 0, ...extra });
const box = (o) => ({ css: "div.card", tag: "div", x: 100, y: 100, w: 300, h: 100, pad: [20, 20, 20, 20], border: [0, 0, 0, 0], content: { x: 120, y: 120, w: 260, h: 60 }, centred: false, stretched: false, lastMarginBottom: 0, lastCss: null, parent: "section", display: "block", ...o });
const run = (leaves, boxes, fit = false) => evaluate({ data: data(leaves, { boxes }), weight: null, fit }, rules).map((f) => f.rule);

test("inset-y: 40px above and 12px below fails, even space passes", () => {
  assert.ok(run([], [box({ content: { x: 120, y: 140, w: 260, h: 48 } })]).includes("inset-y"));
  assert.ok(!run([], [box()]).includes("inset-y"));
});
test("inset-y: a stretched box (height from its row) is skipped", () => {
  assert.ok(!run([], [box({ content: { x: 120, y: 140, w: 260, h: 48 }, stretched: true })]).includes("inset-y"));
});
test("inset-x: padding 8 left and 24 right fails; centred content off to one side fails", () => {
  assert.ok(run([], [box({ pad: [12, 24, 12, 8] })]).includes("inset-x"));
  assert.ok(!run([], [box()]).includes("inset-x"));
  assert.ok(run([], [box({ centred: true, content: { x: 108, y: 120, w: 200, h: 60 } })]).includes("inset-x"));
  assert.ok(!run([], [box({ centred: true, content: { x: 150, y: 120, w: 200, h: 60 } })]).includes("inset-x"));
});
test("align: left edges 24 and 31 fail, 24 and 24 pass, 24 and 60 (a different column) pass", () => {
  assert.ok(run([tx(24, 100, 300, 30, "ul"), tx(31, 160, 300, 30, "ul")], []).includes("align"));
  assert.ok(!run([tx(24, 100, 300, 30, "ul"), tx(24, 160, 300, 30, "ul")], []).includes("align"));
  assert.ok(!run([tx(24, 100, 300, 30, "ul"), tx(60, 160, 240, 30, "ul")], []).includes("align"));
  assert.ok(!run([tx(24, 100, 300, 30, "ul"), tx(31, 160, 300, 30, "ol")], []).includes("align"));
});
test("rhythm: gaps 16 and 19 fail, 8 and 24 pass", () => {
  const col = (gaps) => { let y = 100; return gaps.reduce((l, g) => { y += 30 + g; l.push(tx(50, y, 300, 30, "div")); return l; }, [tx(50, 100, 300, 30, "div")]); };
  assert.ok(run(col([16, 19]), []).includes("rhythm"));
  assert.ok(!run(col([16, 16]), []).includes("rhythm"));
  assert.ok(!run(col([8, 24]), []).includes("rhythm"));
});
test("max-gap: a gap over 20% of the screen fails on a fit screen only", () => {
  const l = [tx(300, 100, 400, 40, "div"), tx(300, 400, 400, 40, "div")];
  assert.ok(run(l, [], true).includes("max-gap"));
  assert.ok(!run(l, [], false).includes("max-gap"));
  assert.ok(!run([tx(300, 100, 400, 40, "div"), tx(300, 180, 400, 40, "div")], [], true).includes("max-gap"));
});
test("sibling-mismatch: three cards with different heights or padding fail, equal cards pass", () => {
  const c = (x, h, pad) => box({ css: "div.c" + x, x, h, w: 200, pad, y: 100, parent: "div.row" });
  assert.ok(run([], [c(0, 200, [20, 20, 20, 20]), c(220, 260, [20, 20, 20, 20]), c(440, 200, [20, 20, 20, 20])]).includes("sibling-mismatch"));
  assert.ok(run([], [c(0, 200, [20, 20, 20, 20]), c(220, 200, [30, 30, 30, 30])]).includes("sibling-mismatch"));
  assert.ok(!run([], [c(0, 200, [20, 20, 20, 20]), c(220, 201, [20, 20, 20, 20])]).includes("sibling-mismatch"));
});
test("line-length: 150 characters per line fails, 60 passes, one line passes", () => {
  assert.ok(run([tx(100, 100, 800, 90, "div", { chars: 400, lineH: 30 })], []).includes("line-length"));
  assert.ok(!run([tx(100, 100, 400, 90, "div", { chars: 150, lineH: 30 })], []).includes("line-length"));
  assert.ok(!run([tx(100, 100, 800, 30, "div", { chars: 200, lineH: 30 })], []).includes("line-length"));
});
test("pages without box data (Android, iOS) skip the new rules", () => {
  const f = evaluate({ data: data([t(100, 100, 300, 40), t(100, 160, 300, 40)]), weight: null, fit: true }, rules);
  assert.ok(!f.some((x) => ["inset-y", "inset-x", "align", "rhythm", "max-gap", "sibling-mismatch", "line-length"].includes(x.rule)));
});
