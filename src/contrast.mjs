const clamp = (value, minimum = 0, maximum = 1) =>
  Math.min(maximum, Math.max(minimum, value));

export function parseHex(value) {
  const normalised = String(value).trim().replace(/^#/, "");
  const expanded =
    normalised.length === 3
      ? normalised
          .split("")
          .map((character) => `${character}${character}`)
          .join("")
      : normalised;
  if (!/^[0-9a-f]{6}$/i.test(expanded)) {
    throw new TypeError(`"${value}" is not a three- or six-digit hexadecimal colour.`);
  }
  return {
    r: Number.parseInt(expanded.slice(0, 2), 16),
    g: Number.parseInt(expanded.slice(2, 4), 16),
    b: Number.parseInt(expanded.slice(4, 6), 16)
  };
}

export function toHex({ r, g, b }) {
  const channel = (value) =>
    Math.round(clamp(value, 0, 255)).toString(16).padStart(2, "0");
  return `#${channel(r)}${channel(g)}${channel(b)}`.toUpperCase();
}

function toLinear(channel) {
  const value = channel / 255;
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

function fromLinearUnclamped(channel) {
  const value =
    channel <= 0.0031308
      ? channel * 12.92
      : 1.055 * channel ** (1 / 2.4) - 0.055;
  return value * 255;
}

export function luminance(colour) {
  const red = toLinear(colour.r);
  const green = toLinear(colour.g);
  const blue = toLinear(colour.b);
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

export function contrastRatio(foreground, background) {
  const light = Math.max(luminance(foreground), luminance(background));
  const dark = Math.min(luminance(foreground), luminance(background));
  return (light + 0.05) / (dark + 0.05);
}

export function rgbToOklab(colour) {
  const red = toLinear(colour.r);
  const green = toLinear(colour.g);
  const blue = toLinear(colour.b);
  const l = 0.4122214708 * red + 0.5363325363 * green + 0.0514459929 * blue;
  const m = 0.2119034982 * red + 0.6806995451 * green + 0.1073969566 * blue;
  const s = 0.0883024619 * red + 0.2817188376 * green + 0.6299787005 * blue;
  const lRoot = Math.cbrt(l);
  const mRoot = Math.cbrt(m);
  const sRoot = Math.cbrt(s);
  return {
    L: 0.2104542553 * lRoot + 0.793617785 * mRoot - 0.0040720468 * sRoot,
    a: 1.9779984951 * lRoot - 2.428592205 * mRoot + 0.4505937099 * sRoot,
    b: 0.0259040371 * lRoot + 0.7827717662 * mRoot - 0.808675766 * sRoot
  };
}

export function oklabToRgb({ L, a, b }) {
  const lRoot = L + 0.3963377774 * a + 0.2158037573 * b;
  const mRoot = L - 0.1055613458 * a - 0.0638541728 * b;
  const sRoot = L - 0.0894841775 * a - 1.291485548 * b;
  const l = lRoot ** 3;
  const m = mRoot ** 3;
  const s = sRoot ** 3;
  return {
    r: fromLinearUnclamped(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    g: fromLinearUnclamped(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    b: fromLinearUnclamped(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s)
  };
}

export function isInSrgbGamut(colour, tolerance = 0.0001) {
  return ['r', 'g', 'b'].every((channel) => Number.isFinite(colour[channel]) && colour[channel] >= -tolerance && colour[channel] <= 255 + tolerance);
}

export function perceptualDistance(first, second) {
  const a = rgbToOklab(first);
  const b = rgbToOklab(second);
  return Math.hypot(a.L - b.L, a.a - b.a, a.b - b.b);
}

export function tailorForeground(foreground, background, target = 4.5, limit = 8) {
  if (!Number.isFinite(target) || target < 1 || target > 21) {
    throw new RangeError("The target contrast must be between 1 and 21.");
  }
  const source = rgbToOklab(foreground);
  const candidates = [];
  for (let step = 0; step <= 200; step += 1) {
    const L = step / 200;
    const unquantised = oklabToRgb({ ...source, L });
    if (!isInSrgbGamut(unquantised)) continue;
    const hex = toHex(unquantised);
    const candidate = parseHex(hex);
    const ratio = contrastRatio(candidate, background);
    if (ratio + Number.EPSILON >= target) {
      candidates.push({
        colour: candidate,
        hex,
        ratio,
        distance: perceptualDistance(foreground, candidate),
        direction: L < source.L ? "darker" : L > source.L ? "lighter" : "unchanged",
        gamut: "sRGB"
      });
    }
  }
  const unique = new Map();
  for (const candidate of candidates) {
    const existing = unique.get(candidate.hex);
    if (!existing || candidate.distance < existing.distance) {
      unique.set(candidate.hex, candidate);
    }
  }
  return [...unique.values()]
    .sort((first, second) => first.distance - second.distance || second.ratio - first.ratio)
    .slice(0, limit);
}
