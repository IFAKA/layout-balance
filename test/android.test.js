import test from "node:test";
import assert from "node:assert/strict";
import { parseUiXml } from "../src/android.js";

const xml = `<?xml version='1.0' encoding='UTF-8' standalone='yes' ?><hierarchy rotation="0">
<node class="android.widget.FrameLayout" package="com.android.systemui" bounds="[0,0][1080,100]"><node class="android.widget.TextView" package="com.android.systemui" text="10:09" bounds="[40,30][160,70]"/></node>
<node class="android.widget.FrameLayout" package="app" bounds="[0,100][1080,2200]">
  <node class="android.widget.TextView" package="app" text="Hello" bounds="[300,400][780,500]"/>
  <node class="android.widget.ImageView" package="app" bounds="[340,560][740,960]"/>
</node>
<node class="android.view.View" package="com.android.systemui" bounds="[0,2200][1080,2400]"/>
</hierarchy>UI hierchary dumped to: /dev/tty`;

test("uiautomator xml becomes leaves, bars and a usable screen", () => {
  const d = parseUiXml(xml, 1080, 2400);
  assert.equal(d.headerBottom, 100);
  assert.equal(d.H, 2200);
  const content = d.leaves.filter((l) => !l.fixed);
  assert.deepEqual(content.map((l) => l.kind), ["text", "media"]);
});
