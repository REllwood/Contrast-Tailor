import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("fitting a candidate refreshes the current contrast measurement", async () => {
  const source = await readFile(new URL("../public/app.mjs", import.meta.url), "utf8");
  const start = source.indexOf("function selectCandidate(");
  const end = source.indexOf("\nfunction renderCandidates", start);
  const handler = source.slice(start, end);
  const assignment = handler.indexOf("foregroundInput.value = candidate.hex");
  const refresh = handler.indexOf("updateCurrentMeasurement()");

  assert.ok(assignment >= 0, "selection must update the foreground input");
  assert.ok(refresh > assignment, "selection must refresh the displayed current ratio after updating the input");
});
