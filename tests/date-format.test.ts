import assert from "node:assert/strict";
import test from "node:test";

import { formatCompactDate } from "../src/utils/formatCompactDate.ts";

test("compact dates retain common date separators", () => {
  // 2026-08-19: post cards rendered 20260819, making the date harder to scan.
  assert.equal(
    formatCompactDate(new Date("2026-08-18T16:30:00Z"), "Asia/Shanghai"),
    "2026-08-19"
  );
});
