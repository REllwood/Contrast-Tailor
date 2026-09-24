import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

// A small stand-in for the DOM, covering only what app.mjs uses, so the real
// script can run against the real page without a browser or dependencies.
class FakeElement {
  constructor(tagName, attributes = {}) {
    this.tagName = tagName.toUpperCase();
    this.attributes = new Map(Object.entries(attributes));
    this.children = [];
    this.listeners = {};
    this.text = "";
    this.value = attributes.value ?? "";
    this.hidden = "hidden" in attributes;
    this.className = attributes.class ?? "";
    this.type = attributes.type ?? "";
    const properties = new Map();
    this.style = {
      setProperty: (name, value) => properties.set(name, value),
      getPropertyValue: (name) => properties.get(name) ?? ""
    };
  }

  get textContent() {
    return this.text + this.children.map((child) => child.textContent).join("");
  }

  set textContent(value) {
    this.children = [];
    this.text = String(value);
  }

  append(...children) {
    this.children.push(...children);
  }

  replaceChildren(...children) {
    this.text = "";
    this.children = children;
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }

  getAttribute(name) {
    return this.attributes.get(name) ?? null;
  }

  removeAttribute(name) {
    this.attributes.delete(name);
  }

  addEventListener(type, listener) {
    (this.listeners[type] ??= []).push(listener);
  }

  dispatch(type) {
    const event = {
      type,
      target: this,
      defaultPrevented: false,
      preventDefault() {
        this.defaultPrevented = true;
      }
    };
    for (const listener of this.listeners[type] ?? []) listener(event);
    return event;
  }

  click() {
    this.dispatch("click");
  }

  querySelectorAll(tagName) {
    const found = [];
    const visit = (element) => {
      for (const child of element.children) {
        if (child.tagName === tagName.toUpperCase()) found.push(child);
        visit(child);
      }
    };
    visit(this);
    return found;
  }
}

const html = await readFile(new URL("../public/index.html", import.meta.url), "utf8");
let instances = 0;

// Builds every element with an id from index.html, then runs a fresh copy of app.mjs.
async function openApp() {
  const elements = new Map();
  for (const [, tagName, attributeText] of html.matchAll(/<(\w+)(\s[^>]*)?>/g)) {
    const attributes = Object.fromEntries(
      [...(attributeText ?? "").matchAll(/([\w-]+)(?:="([^"]*)")?/g)].map(([, name, value]) => [
        name,
        value ?? ""
      ])
    );
    if (attributes.id) elements.set(attributes.id, new FakeElement(tagName, attributes));
  }
  const [, selectedTarget] = html.match(/<select id="target">[\s\S]*?<option value="([^"]+)" selected>/);
  elements.get("target").value = selectedTarget;
  globalThis.document = {
    querySelector(selector) {
      assert.match(selector, /^#[\w-]+$/, `the fake DOM only supports id selectors, not ${selector}`);
      const element = elements.get(selector.slice(1));
      assert.ok(element, `app.mjs looks for ${selector}, which index.html does not have`);
      return element;
    },
    createElement: (tagName) => new FakeElement(tagName)
  };
  instances += 1;
  await import(`../public/app.mjs?instance=${instances}`);
  return elements;
}

function type(input, value) {
  input.value = value;
  input.dispatch("input");
}

function submit(page) {
  const event = page.get("contrast-form").dispatch("submit");
  assert.ok(event.defaultPrevented, "the form must not navigate away");
}

const buttonsIn = (page) => page.get("candidate-list").querySelectorAll("button");

test("measures the default pair on load", async () => {
  const page = await openApp();
  assert.equal(page.get("current-ratio").textContent, "3.55:1");
  assert.equal(page.get("current-verdict").textContent, "Below 4.5:1");
  assert.equal(page.get("sample").style.getPropertyValue("--sample-foreground"), "#7282D8");
  assert.equal(page.get("sample").style.getPropertyValue("--sample-background"), "#FFFFFF");
});

test("fitting a candidate refreshes the current measurement", async () => {
  const page = await openApp();
  submit(page);
  const [first] = buttonsIn(page);
  assert.ok(first, "the default pair should produce candidates");
  first.click();

  const fitted = page.get("foreground").value;
  assert.match(fitted, /^#[0-9A-F]{6}$/);
  assert.notEqual(fitted, "#7282D8");
  assert.equal(page.get("foreground-picker").value, fitted);
  assert.equal(page.get("sample").style.getPropertyValue("--sample-foreground"), fitted);
  assert.equal(page.get("current-ratio").textContent, page.get("selected-ratio").textContent);
  assert.equal(page.get("current-verdict").textContent, "Meets 4.5:1");
  assert.equal(first.getAttribute("aria-current"), "true");
});

test("typed colours without # or with three digits update the preview and picker", async () => {
  const page = await openApp();
  type(page.get("foreground"), "FFFF00");
  assert.equal(page.get("current-ratio").textContent, "1.07:1");
  assert.equal(page.get("sample").style.getPropertyValue("--sample-foreground"), "#FFFF00");
  assert.equal(page.get("foreground-picker").value, "#FFFF00");

  type(page.get("foreground"), "#abc");
  assert.equal(page.get("foreground-picker").value, "#AABBCC");
  page.get("foreground").dispatch("change");
  assert.equal(page.get("foreground").value, "#AABBCC");
});

test("says when the pair already meets the target", async () => {
  const page = await openApp();
  type(page.get("foreground"), "#1A1A1A");
  submit(page);
  assert.match(page.get("status").textContent, /#1A1A1A already meets 4\.5:1/);
  assert.equal(page.get("candidate-list").children.length, 1);
  assert.equal(buttonsIn(page).length, 0);
});

test("explains when no foreground can reach the target", async () => {
  const page = await openApp();
  type(page.get("foreground"), "#777777");
  type(page.get("background"), "#777777");
  page.get("target").value = "7";
  page.get("target").dispatch("input");
  submit(page);
  assert.match(page.get("candidate-list").textContent, /not even black or white/);
  assert.equal(buttonsIn(page).length, 0);
});

test("reports an invalid colour and clears the error once it is corrected", async () => {
  const page = await openApp();
  type(page.get("foreground"), "#12");
  assert.equal(page.get("current-ratio").textContent, "Invalid pair");
  submit(page);
  assert.equal(page.get("error").hidden, false);
  assert.match(page.get("error").textContent, /three- or six-digit/);

  type(page.get("foreground"), "#123");
  assert.equal(page.get("error").hidden, true);
  assert.equal(page.get("current-ratio").textContent, "16.14:1");
});

test("changing the target re-measures and clears stale results", async () => {
  const page = await openApp();
  submit(page);
  buttonsIn(page)[0].click();
  page.get("target").value = "7";
  page.get("target").dispatch("input");
  assert.equal(page.get("current-verdict").textContent, "Below 7:1");
  assert.equal(buttonsIn(page).length, 0);
  assert.equal(page.get("selected-ratio").textContent, "—");
});
