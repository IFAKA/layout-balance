import { test } from "node:test";
import assert from "node:assert";
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { fix } from "../src/fix.js";
import { check, loadConfig } from "../src/index.js";

const page = readFileSync(new URL("./agent/fixtures/existing/index.html", import.meta.url), "utf8");
const serve = (html) => new Promise((ok) => { const s = createServer((_, r) => { r.setHeader("content-type", "text/html"); r.end(html); }).listen(0, () => ok(s)); });

test("--fix prints CSS that is verified, and pasting it into the page passes a plain check", async () => {
  const config = loadConfig();
  const a = await serve(page), url = (s) => `http://localhost:${s.address().port}`;
  const r = await fix(url(a), config);
  a.close();
  assert.ok(r.verified, "fix says verified");
  const b = await serve(page.replace("</head>", `<style>${r.css}</style></head>`));
  const after = await check(url(b), config);
  b.close();
  assert.deepEqual(after.filter((x) => x.findings.length), [], "the pasted CSS passes with no extra try");
});
