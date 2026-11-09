# Corral fonts

These are the same Google Fonts families and Latin subsets previously fetched by
`next/font/google`. They are committed so development and production compilation
do not need to contact Google. `next/font/local` handles preloading, hashed URLs,
and fallbacks. Font variables and the existing typography stay in place.

| File | Family | Axes |
| --- | --- | --- |
| `inter-latin-variable.woff2` | Inter | weight 100–900 |
| `inter-tight-latin-variable.woff2` | Inter Tight | weight 100–900 |
| `geist-mono-latin-variable.woff2` | Geist Mono | weight 100–900 |
| `newsreader-latin-variable.woff2` | Newsreader | weight 200–800, optical size 6–72 |
| `newsreader-italic-latin-variable.woff2` | Newsreader italic | weight 200–800, optical size 6–72 |

Downloaded from Google's font stylesheet on 2026-11-08. Upstream licenses are in
`licenses/`, copied from the corresponding `ofl/` directories in
https://github.com/google/fonts. Newsreader loads only on `/fenceline`.

To update, request variable WOFF2 files from the Google Fonts CSS API with a
modern browser user agent. Keep the family, axis ranges, Latin subset, and
licenses together. Review typography after an update.
