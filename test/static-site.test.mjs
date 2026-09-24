import test from "node:test";
import assert from "node:assert/strict";
import { access, readFile, readdir } from "node:fs/promises";

const publicDirectory = new URL("../public/", import.meta.url);

// public/ must work from any static host, including a subpath such as
// https://example.github.io/Contrast-Tailor/, so every reference is relative.
test("the page only references relative files that exist in public/", async () => {
  const page = await readFile(new URL("index.html", publicDirectory), "utf8");
  const references = [...page.matchAll(/\s(?:src|href)="([^"]+)"/g)]
    .map(([, reference]) => reference)
    .filter((reference) => !reference.startsWith("data:"));
  assert.ok(references.length > 0);
  for (const reference of references) {
    assert.doesNotMatch(reference, /^(\/|[a-z]+:)/i, `${reference} must be relative`);
    await access(new URL(reference, publicDirectory));
  }
});

test("modules only import relative files that exist in public/", async () => {
  const modules = (await readdir(publicDirectory)).filter((name) => name.endsWith(".mjs"));
  assert.ok(modules.length > 0);
  for (const name of modules) {
    const source = await readFile(new URL(name, publicDirectory), "utf8");
    for (const [, specifier] of source.matchAll(/\bfrom\s+"([^"]+)"/g)) {
      assert.match(specifier, /^\.\//, `${name} imports ${specifier}, which must be relative`);
      await access(new URL(specifier, new URL(name, publicDirectory)));
    }
  }
});
