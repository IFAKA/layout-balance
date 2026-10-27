# How the skill was tested with a cheap model

Two cases, each run by a Claude Haiku agent that only had `skills/layout-balance/SKILL.md` and a task. The tool, not the agent, judges the result.
- **New project** (empty folder): "build a landing page, 3 full-screen sections". Pass = tool exit 0.
- **Existing project** (`fixtures/existing`, fails 8 of 8 screens): "make it balanced, keep all content". Pass = tool exit 0 and all text kept.

`agent.test.js` keeps the two results as regression fixtures. To rerun the agent step, give a Haiku agent the same task and check with `test/agent/verify.sh <dir>`.
Found by this test: the tool ignored a picture box drawn with a gradient only (no background colour). Fixed in `src/collect.js`.
