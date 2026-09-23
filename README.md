<div align="center">

# Contrast Tailor

**Adjust an inaccessible colour pair while preserving the character of the palette.**

[![License: MIT](https://img.shields.io/badge/license-MIT-2f6f4e?style=flat-square)](LICENSE)
![Node 22+](https://img.shields.io/badge/node-%3E%3D22-43853d?style=flat-square&logo=node.js&logoColor=white)
![Zero dependencies](https://img.shields.io/badge/dependencies-0-555?style=flat-square)

</div>

When a brand colour fails WCAG contrast, the usual fix is to darken it until it passes, and it stops looking like the brand. Contrast Tailor searches for the smallest change that meets your target while keeping the colour's direction in OKLab, then shows you exactly what it gave up to get there.

## What it does

- Calculates the WCAG contrast ratio for any foreground and background
- Searches for foreground alternatives in OKLab that keep the original colour direction
- Previews the proposed pair next to the current one
- Explains the measured trade-off for every candidate
- Gives the same answer every time, and never edits your token files

## Quick start

Requires Node.js 22 or newer. No `npm install` needed.

```sh
git clone https://github.com/REllwood/ContrastTailor.git
cd ContrastTailor
npm start
```

Open http://127.0.0.1:4173, enter a foreground and background colour, choose a target and press **Find tailored colours**. **Fit this colour** applies a candidate to the controls and preview.

## Status

v0.1 fits one colour pair at a time. Next up are whole-palette fitting, Figma token import and picking colours straight from an element on a page.

## Development

```sh
npm test        # contrast maths and app tests
npm run check   # tests plus syntax checks
```

## License

[MIT](LICENSE)
