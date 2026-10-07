# Manrope (vendored)

Self-hosted so the app never loads fonts from a CDN at runtime (UI-REFRESH-001).

- Source: npm package `@fontsource-variable/manrope@5.3.0` (fetched with `npm pack`
  outside the repo; NOT a project dependency).
- Files: `manrope-latin-wght-normal.woff2`, `manrope-latin-ext-wght-normal.woff2`
  (variable font, weights 200–800). The latin subset includes U+2212 (true minus).
- License: SIL Open Font License 1.1 — see `OFL.txt` (copied from the package `LICENSE`).
- `@font-face` rules (and their `unicode-range`) live in `src/styles/index.css`.
