import test from "node:test";
import assert from "node:assert/strict";
import {
  contrastRatio,
  isInSrgbGamut,
  oklabToOklch,
  parseHex,
  rgbToOklab,
  tailorForeground,
  toHex
} from "../src/contrast.mjs";

const hueOf = (colour) => oklabToOklch(rgbToOklab(colour)).h;
const hueDifference = (first, second) =>
  Math.abs(Math.atan2(Math.sin(first - second), Math.cos(first - second))) * (180 / Math.PI);

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

test("finds candidates for saturated colours by giving up chroma, not hue", () => {
  const cases = [
    ["#FF0000", "#FFFFFF", 4.5],
    ["#FF0000", "#FFFFFF", 7],
    ["#FFD700", "#FFFFFF", 4.5],
    ["#0000FF", "#000000", 4.5],
    ["#E91E63", "#121212", 7]
  ];
  for (const [foregroundHex, backgroundHex, target] of cases) {
    const foreground = parseHex(foregroundHex);
    const background = parseHex(backgroundHex);
    const candidates = tailorForeground(foreground, background, target);
    assert.ok(candidates.length > 0, `${foregroundHex} on ${backgroundHex} should have candidates`);
    assert.ok(candidates.every((candidate) => candidate.ratio >= target));
    const [closest] = candidates;
    assert.ok(closest.chromaRetained < 1, `${foregroundHex} should report the chroma it gave up`);
    assert.ok(
      hueDifference(hueOf(closest.colour), hueOf(foreground)) < 1,
      `${closest.hex} should keep the hue of ${foregroundHex}`
    );
  }
});

test("keeps full chroma when lightness alone meets the target", () => {
  const [closest] = tailorForeground(parseHex("#5C6CBE"), parseHex("#FFFFFF"), 7);
  assert.equal(closest.direction, "darker");
  assert.ok(closest.chromaRetained > 0.97);
});

test("finds the first passing colour rather than the nearest grid step", () => {
  // A 0.005 lightness grid alone overshoots each of these by 0.1 or more.
  for (const [foregroundHex, backgroundHex, target] of [
    ["#6B7280", "#FFFFFF", 7],
    ["#2563EB", "#FFFFFF", 7],
    ["#5C6CBE", "#000000", 7]
  ]) {
    const [closest] = tailorForeground(parseHex(foregroundHex), parseHex(backgroundHex), target);
    assert.ok(closest.ratio - target < 0.05, `${closest.hex} overshoots ${target}:1 at ${closest.ratio}`);
  }
});

test("keeps neutral colours exactly neutral", () => {
  const candidates = tailorForeground(parseHex("#808080"), parseHex("#808080"), 4.5);
  assert.ok(candidates.length > 0);
  assert.ok(candidates.every(({ colour }) => colour.r === colour.g && colour.g === colour.b));
  assert.ok(candidates.every((candidate) => candidate.chromaRetained === null));
});

test("returns no candidates when no foreground can reach the target", () => {
  // Neither black (4.69:1) nor white (4.48:1) reaches 7:1 on this grey.
  assert.deepEqual(tailorForeground(parseHex("#777777"), parseHex("#777777"), 7), []);
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
