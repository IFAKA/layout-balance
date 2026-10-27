#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { check, loadConfig } from "./index.js";
import { fix } from "./fix.js";
import { checkAndroid } from "./android.js";

const args = process.argv.slice(2);
const android = args[0] === "android"; if (android) args.shift();
const flag = (n) => { const i = args.indexOf(n); return i >= 0 ? args.splice(i, 2)[1] : null; };
if (args.includes("-h") || args.includes("--help") || !args.length) {
  console.log(`layout-balance <url>
layout-balance android <screens.json> [--serial id]  (phone over adb)
   [--config file] [--out dir] [--viewport WxH] [--sections css] [--json] [--plan] [--fix]
--fix: try CSS on the real page, measure again, and print a block that passes on every screen (or what is left).
--plan: for every failing screen, print the exact fixes (px, selector, CSS) and whether they pass.
Measures the visual balance of each screen of a page. Exit 1 if any rule fails.`);
  process.exit(args.length ? 0 : 2);
}
const doFix = args.includes("--fix"); if (doFix) args.splice(args.indexOf("--fix"), 1);
const withPlan = args.includes("--plan"); if (withPlan) args.splice(args.indexOf("--plan"), 1);
const json = args.includes("--json"); if (json) args.splice(args.indexOf("--json"), 1);
const config = loadConfig(flag("--config"));
const vp = flag("--viewport"); if (vp) { const [w, h] = vp.split("x").map(Number); config.viewports = [{ name: vp, width: w, height: h }]; }
const sec = flag("--sections"); if (sec) config.sections = sec;
const out = flag("--out");
const serial = flag("--serial");
const results = android
  ? await checkAndroid(JSON.parse(readFileSync(args[0], "utf8")), config, { serial, outDir: out })
  : await check(args[0], config, { outDir: out, withPlan });
let fixed = null;
if (doFix && !android && results.some((r) => r.findings.length)) fixed = await fix(args[0], config);
const bad = results.filter((r) => r.findings.length);
if (json) console.log(JSON.stringify(fixed ? { results, fix: fixed } : results, null, 2));
else {
  for (const r of results) {
    const mark = r.findings.length ? "FAIL" : "ok  ";
    console.log(`${mark} ${r.size.padEnd(9)} ${r.section}${r.fit ? "" : " (scrolling)"}`);
    for (const f of r.findings) console.log(`       - ${f.rule}: ${f.message} (limit ${f.limit})`);
    if (r.plan) {
      r.plan.steps.forEach((s, i) => console.log(`       ${i + 1}. [${s.rule}] ${s.target}: ${s.do}${s.css ? "\n          css: " + s.css : ""}`));
      console.log(`       plan check: ${r.plan.predicted}${r.plan.weightIsEstimate ? " (weight is an estimate)" : ""}`);
    }
  }
  if (fixed) {
    console.log(`\n${fixed.verified ? `TESTED FIX: this CSS passes on all ${fixed.screens} screens. Paste it at the end of your stylesheet. Do not measure again.` : "NOT FULLY FIXED: this CSS helps, but these screens still fail:"}\n${fixed.css}`);
    if (!fixed.verified) for (const r of fixed.failing) console.log(`   ${r.size} ${r.section}: ${r.findings.map((f) => f.rule).join(", ")}`);
  }
  console.log(`\n${bad.length ? bad.length + " of " + results.length + " screens fail" : "all " + results.length + " screens balanced"}`);
}
process.exit(bad.length ? 1 : 0);
