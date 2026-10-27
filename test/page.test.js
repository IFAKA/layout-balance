import test from "node:test";
import assert from "node:assert/strict";
import { launch, measureScreen, loadConfig } from "../src/index.js";

const css = "body{margin:0;background:#000;color:#fff;font:20px sans-serif}.s{height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center}";
const good = `<style>${css}</style><div class=s><h1>Title</h1><p>Short line of text</p><div style="width:120px;height:120px;border-radius:50%;background:#2997ff;margin-top:24px"></div></div>`;
const crowded = `<style>${css}.s{justify-content:flex-start}</style><div class=s><h1 style="margin:0">Title</h1><div style="width:600px;height:600px;border-radius:50%;background:#2997ff;margin-top:8px"></div></div>`;
const rules = loadConfig().rules;

async function run(html) {
  const b = await launch();
  const page = await b.newPage({ viewport: { width: 1280, height: 720 } });
  await page.setContent(html);
  const m = await measureScreen(page, rules, true);
  await b.close();
  return m.findings.map((f) => f.rule);
}

test("a centred, even screen passes", async () => assert.deepEqual(await run(good), []));
test("a top-heavy screen with a huge picture fails", async () => {
  const rulesHit = await run(crowded);
  for (const r of ["dominance", "top-clearance"]) assert.ok(rulesHit.includes(r), `${r} in ${rulesHit}`);
});
