// Regression for the skill: pages that a Haiku agent produced by following skills/layout-balance/SKILL.md.
// The judge is the tool, never the agent. Needs Chrome, about 30 s. Run: node --test test/agent/agent.test.js
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const cli = join(here, "..", "..", "src", "cli.js");
const run = (dir, ...extra) => spawnSync("node", [cli, "file://" + join(here, "fixtures", dir, "index.html"), ...extra], { encoding: "utf8" });

test("existing project: the unbalanced page fails and has a plan", () => {
  const r = run("existing", "--plan");
  assert.equal(r.status, 1);
  assert.match(r.stdout, /\[dominance\]/);
  assert.match(r.stdout, /max-height/);
});
test("existing project: the page the agent fixed from the plan is balanced", () => {
  const r = run("existing-fixed");
  assert.equal(r.status, 0, r.stdout);
});
test("new project: the page the agent wrote from the skill is balanced", () => {
  const r = run("new-built");
  assert.equal(r.status, 0, r.stdout);
});
