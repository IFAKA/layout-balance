import { test } from "node:test";
import assert from "node:assert";
import { createServer } from "node:http";
import { readFileSync, mkdtempSync, cpSync, existsSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, extname } from "node:path";
import { fix } from "../src/fix.js";
import { write } from "../src/source.js";
import { check, loadConfig } from "../src/index.js";

const types = { ".html": "text/html", ".css": "text/css" };
const serve = (dir) => new Promise((ok) => {
  const s = createServer((q, r) => {
    const p = join(dir, q.url === "/" ? "index.html" : q.url.split("?")[0]);
    if (!existsSync(p)) { r.statusCode = 404; return r.end(); }
    r.setHeader("content-type", types[extname(p)] || "text/plain"); r.end(readFileSync(p));
  }).listen(0, () => ok(s));
});
const root = new URL("./hard/", import.meta.url).pathname;

// Every page here is broken on purpose in a different way. For each: the tool edits the page's own files, then a plain check of the edited page must pass.
for (const name of readdirSync(root)) {
  test(`--fix --write: ${name}`, { timeout: 240000 }, async () => {
    const dir = mkdtempSync(join(tmpdir(), "lb-")); cpSync(join(root, name), dir, { recursive: true });
    const config = loadConfig(), s = await serve(dir), url = `http://localhost:${s.address().port}`;
    const r = await fix(url, config);
    assert.ok(r.verified, `fix says verified (left: ${r.failing.map((f) => f.size + " " + f.section + " " + f.findings.map((x) => x.rule)).join("; ")})`);
    const w = write(r.edits, dir);
    assert.deepEqual(w.manual, [], "every edit could be written");
    const after = await check(url, config);
    s.close();
    assert.deepEqual(after.filter((x) => x.findings.length), [], "the edited page passes a plain check");
  });
}
