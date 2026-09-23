import test from "node:test";
import assert from "node:assert/strict";
import {
  contrastRatio,
  isInSrgbGamut,
  parseHex,
  tailorForeground,
  toHex
} from "../src/contrast.mjs";

test("parses short and long hexadecimal colours", () => {
  assert.deepEqual(parseHex("#abc"), { r: 170, g: 187, b: 204 });
  assert.deepEqual(parseHex("112233"), { r: 17, g: 34, b: 51 });
  assert.equal(toHex({ r: 17, g: 34, b: 51 }), "#112233");
});

test("calculates reference contrast ratios without rounding the decision", () => {
  assert.equal(contrastRatio(parseHex("#000"), parseHex("#fff")), 21);
  assert.equal(contrastRatio(parseHex("#777"), parseHex("#777")), 1);
});

test("returns stable candidates that meet the requested contrast", () => {
  const foreground = parseHex("#5C6CBE");
  const background = parseHex("#FFFFFF");
  const first = tailorForeground(foreground, background, 4.5);
  const second = tailorForeground(foreground, background, 4.5);
  assert.ok(first.length > 0);
  assert.deepEqual(first, second);
  assert.ok(first.every((candidate) => candidate.ratio >= 4.5));
  assert.ok(first.every((candidate) => candidate.gamut === "sRGB" && isInSrgbGamut(candidate.colour)));
  assert.ok(first.every((candidate) => candidate.ratio === contrastRatio(parseHex(candidate.hex), background)));
  assert.ok(first[0].distance <= first.at(-1).distance);
});

test("rejects raw out-of-gamut channels before hexadecimal quantisation", () => {
  assert.equal(isInSrgbGamut({ r: -1, g: 40, b: 50 }), false);
  assert.equal(isInSrgbGamut({ r: 20, g: 40, b: 256 }), false);
  assert.equal(isInSrgbGamut({ r: 20, g: 40, b: 255 }), true);
});

test("rejects invalid colours and impossible target values", () => {
  assert.throws(() => parseHex("#12"), /three- or six-digit/);
  assert.throws(
    () => tailorForeground(parseHex("#000"), parseHex("#fff"), 22),
    /between 1 and 21/
  );
});
