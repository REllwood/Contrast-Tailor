import {
  contrastRatio,
  parseHex,
  tailorForeground,
  toHex
} from "/contrast.mjs";

const form = document.querySelector("#contrast-form");
const foregroundInput = document.querySelector("#foreground");
const foregroundPicker = document.querySelector("#foreground-picker");
const backgroundInput = document.querySelector("#background");
const backgroundPicker = document.querySelector("#background-picker");
const targetInput = document.querySelector("#target");
const status = document.querySelector("#status");
const error = document.querySelector("#error");
const list = document.querySelector("#candidate-list");
const sample = document.querySelector("#sample");
const currentRatio = document.querySelector("#current-ratio");
const currentVerdict = document.querySelector("#current-verdict");
const selectedRatio = document.querySelector("#selected-ratio");
const selectedDistance = document.querySelector("#selected-distance");
const searchButton = document.querySelector("#search-button");
const cancelButton = document.querySelector("#cancel-button");

let activeController = null;

function invalidateCandidates(message = "Inputs changed. Search again for measurements based on this pair.") {
  activeController?.abort();
  list.replaceChildren();
  const item = document.createElement("li");
  item.className = "empty";
  item.textContent = message;
  list.append(item);
  selectedRatio.textContent = "—";
  selectedDistance.textContent = "—";
  status.textContent = message;
  clearError();
}

function syncTextAndPicker(text, picker) {
  picker.addEventListener("input", () => {
    text.value = picker.value.toUpperCase();
    updateCurrentMeasurement();
    invalidateCandidates();
  });
  text.addEventListener("input", () => {
    try {
      picker.value = toHex(parseHex(text.value));
    } catch {
      // Leave the picker on the last valid colour while the hex is incomplete.
    }
    updateCurrentMeasurement();
    invalidateCandidates();
  });
  text.addEventListener("change", () => {
    try {
      text.value = toHex(parseHex(text.value));
    } catch {
      // Keep what was typed so it can be corrected; the search reports the error.
    }
  });
}

function setBusy(isBusy, message = "") {
  form.setAttribute("aria-busy", String(isBusy));
  status.dataset.loading = String(isBusy);
  status.textContent = message;
  searchButton.disabled = isBusy;
  cancelButton.hidden = !isBusy;
}

function showError(message) {
  error.textContent = message;
  error.hidden = false;
}

function clearError() {
  error.textContent = "";
  error.hidden = true;
}

// Truncate rather than round so a failing 4.497 never reads as a passing 4.50.
function formatRatio(ratio) {
  return (Math.floor(ratio * 100 + 1e-9) / 100).toFixed(2);
}

function updateCurrentMeasurement() {
  try {
    const foreground = parseHex(foregroundInput.value);
    const background = parseHex(backgroundInput.value);
    const ratio = contrastRatio(foreground, background);
    const target = Number.parseFloat(targetInput.value);
    currentRatio.textContent = `${formatRatio(ratio)}:1`;
    currentVerdict.textContent = `${ratio + Number.EPSILON >= target ? "Meets" : "Below"} ${target}:1`;
    sample.style.setProperty("--sample-foreground", toHex(foreground));
    sample.style.setProperty("--sample-background", toHex(background));
  } catch {
    currentRatio.textContent = "Invalid pair";
    currentVerdict.textContent = "";
  }
}

function selectCandidate(candidate, button) {
  foregroundInput.value = candidate.hex;
  foregroundPicker.value = candidate.hex;
  updateCurrentMeasurement();
  selectedRatio.textContent = `${formatRatio(candidate.ratio)}:1`;
  selectedDistance.textContent = candidate.distance.toFixed(3);
  for (const candidateButton of list.querySelectorAll("button")) {
    candidateButton.removeAttribute("aria-current");
  }
  button.setAttribute("aria-current", "true");
  status.textContent = `${candidate.hex} selected at ${formatRatio(candidate.ratio)} to 1.`;
}

function describeChroma(candidate) {
  if (candidate.chromaRetained === null) return "neutral";
  const percentage = Math.round(candidate.chromaRetained * 100);
  return percentage === 100 ? "full chroma" : `${percentage}% chroma`;
}

function renderCandidates(candidates) {
  list.replaceChildren();
  if (candidates.length === 0) {
    const item = document.createElement("li");
    item.className = "empty";
    item.textContent =
      "No foreground colour reaches this target against this background, not even black or white.";
    list.append(item);
    return;
  }
  for (const candidate of candidates) {
    const item = document.createElement("li");
    const swatch = document.createElement("span");
    swatch.className = "swatch";
    swatch.style.background = candidate.hex;
    swatch.setAttribute("aria-hidden", "true");

    const details = document.createElement("span");
    details.className = "candidate-meta";
    const name = document.createElement("strong");
    name.textContent = candidate.hex;
    const measurements = document.createElement("span");
    details.append(name, measurements);
    if (candidate.direction === "unchanged") {
      measurements.textContent = `${formatRatio(candidate.ratio)}:1 · already meets the target`;
      item.append(swatch, details);
      list.append(item);
      continue;
    }
    measurements.textContent = `${formatRatio(candidate.ratio)}:1 · ${candidate.direction} · ${describeChroma(candidate)} · distance ${candidate.distance.toFixed(3)}`;

    const choose = document.createElement("button");
    choose.type = "button";
    choose.textContent = "Fit this colour";
    choose.addEventListener("click", () => selectCandidate(candidate, choose));
    item.append(swatch, details, choose);
    list.append(item);
  }
}

async function waitForPaint(signal) {
  await new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, 180);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(new DOMException("Search cancelled", "AbortError"));
      },
      { once: true }
    );
  });
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  activeController?.abort();
  activeController = new AbortController();
  clearError();
  setBusy(true, "Searching the perceptual lightness range…");
  try {
    const foreground = parseHex(foregroundInput.value);
    const background = parseHex(backgroundInput.value);
    const target = Number.parseFloat(targetInput.value);
    await waitForPaint(activeController.signal);
    const candidates = tailorForeground(foreground, background, target);
    renderCandidates(candidates);
    const alreadyMeets = candidates[0]?.direction === "unchanged";
    setBusy(
      false,
      alreadyMeets
        ? `${candidates[0].hex} already meets ${target}:1 against this background. No change needed.`
        : `${candidates.length} measured alternatives found.`
    );
  } catch (caught) {
    setBusy(false);
    if (caught.name === "AbortError") {
      status.textContent = "Search cancelled. Run a fresh search for the current inputs.";
    } else {
      showError(caught instanceof Error ? caught.message : "The colour search failed.");
      status.textContent = "Search could not be completed.";
    }
  } finally {
    activeController = null;
  }
});

cancelButton.addEventListener("click", () => activeController?.abort());
targetInput.addEventListener("input", () => {
  updateCurrentMeasurement();
  invalidateCandidates("Contrast target changed. Search again for measured alternatives.");
});
syncTextAndPicker(foregroundInput, foregroundPicker);
syncTextAndPicker(backgroundInput, backgroundPicker);
updateCurrentMeasurement();
