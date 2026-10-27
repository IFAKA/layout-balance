#!/usr/bin/env node
import { check, loadConfig } from "./index.js";

const args = process.argv.slice(2);
const flag = (n) => { const i = args.indexOf(n); return i >= 0 ? args.splice(i, 2)[1] : null; };
if (args.includes("-h") || args.includes("--help") || !args.length) {
  console.log(`layout-balance <url> [--config file] [--out dir] [--viewport WxH] [--sections css] [--json]
Measures the visual balance of each screen of a page. Exit 1 if any rule fails.`);
  process.exit(args.length ? 0 : 2);
}
const json = args.includes("--json"); if (json) args.splice(args.indexOf("--json"), 1);
const config = loadConfig(flag("--config"));
const vp = flag("--viewport"); if (vp) { const [w, h] = vp.split("x").map(Number); config.viewports = [{ name: vp, width: w, height: h }]; }
const sec = flag("--sections"); if (sec) config.sections = sec;
const out = flag("--out");
const results = await check(args[0], config, { outDir: out });
const bad = results.filter((r) => r.findings.length);
if (json) console.log(JSON.stringify(results, null, 2));
else {
  for (const r of results) {
    const mark = r.findings.length ? "FAIL" : "ok  ";
    console.log(`${mark} ${r.size.padEnd(9)} ${r.section}${r.fit ? "" : " (scrolling)"}`);
    for (const f of r.findings) console.log(`       - ${f.rule}: ${f.message} (limit ${f.limit})`);
  }
  console.log(`\n${bad.length ? bad.length + " of " + results.length + " screens fail" : "all " + results.length + " screens balanced"}`);
}
process.exit(bad.length ? 1 : 0);
