# Kairos Design

Last updated: 2026-10-05 / Direction: **A. Indigo hours** (chosen from three compared proposals)

## Principles

- Make the time of day itself the color. The time column shifts from a pale morning sky → midday white → evening amber → night indigo. This is the only "eye-catching element" on the screen; everything else stays quiet
- Paint work blocks in calm colors like Japanese mineral pigments (iwa-enogu). Use indigo for selection, focus and the current time
- Use few cards and shadows. Show boundaries with rules, and lift only the drawer as a surface

## Color

| Token | Light | Dark | Use |
|---|---|---|---|
| `--background` | `#f6f7f9` | `#10182a` | Screen background |
| `--card` (surface) | `#ffffff` | `#172238` | Calendar body and drawer |
| `--foreground` (ink) | `#1b2333` | `#e3e8f2` | Text |
| `--muted-foreground` | `#6a7385` | `#8f9ab0` | Secondary text |
| `--border` (line) | `#e2e6ec` | `#24304a` | Rules |
| `--primary` (indigo) | `#2e4c8c` | `#8da8e8` | Selection, current time, focus |
| `--dawn` / `--dusk` / `--night` | `#c4d0ea` / `#efc98a` / `#3a4a7c` | `#3d4f7e` / `#6b5636` / `#26335c` | Gradient of the time column |
| `--warn` | `#8a6420` | `#d1a650` | Text of numbers that should draw attention (stumbles). Plain yellow ocher lacks contrast on white |
| `--mix-block` / `-hover` / `-selected` / `-dim` | 20% / 32% / 42% / 9% | 32% / 44% / 50% / 14% | How much of the project color is mixed into a work block's background (`oklab`). `-dim` is for blocks not yet summarized. Dark mixes in more so colors don't turn muddy on navy |

Project colors (mineral pigments; assigned in order to projects without a color)

| Name | Light | Dark |
|---|---|---|
| Gunjō (ultramarine) | `#4f6faf` | `#6f8fd0` |
| Rokushō (verdigris) | `#3f8f80` | `#57ab9b` |
| Ōdo (yellow ocher) | `#c0923a` | `#d1a650` |
| Fuji (wisteria) | `#8c70b5` | `#a68bd0` |
| Sakuranezumi (cherry gray) | `#b07c88` | `#c995a1` |
| Tetsu (iron) | `#5e6b7d` | `#8592a6` |
| Wakatake (young bamboo) | `#5f9a4f` | `#7bb56b` |
| Bengara (red oxide) | `#a4553f` | `#c4735c` |

## Typography

| Role | Typeface |
|---|---|
| Body and UI | IBM Plex Sans JP (400 / 500 / 600). Covers both the English and the Japanese UI |
| Time and date numerals | IBM Plex Sans Condensed (500 / 600), `tabular-nums` |

## Mark

`src/web/public/favicon.svg`. Used for the favicon, the header and the README heading.

- A circle with the same "dawn → evening → night" gradient as the time column, cut in two by a diagonal blade. Kairos, the god of opportunity, is said to stand on a razor's edge; the mark represents cutting out that single moment
- The background shows through the gap of the blade, so the shape reads on both light and dark tabs. The gap is wide enough not to close up even at 16px
- Compared with alternatives (the forelock — opportunity can only be seized from the front — and clock hands), this one held up best at small sizes
- The header mark uses the same file (while ingesting, a progress ring is drawn around it)

## Comparison page

The page comparing the three proposals before adoption: https://claude.ai/artifact/Bgd1XQLQL67RRbRJH36ZaY
