# Book Studio — UI & Design System

## Philosophy
Book Studio should feel like software designed by Apple for professional publishers:
calm, creative, professional. Avoid visual noise. Every screen should encourage focus.
The interface disappears behind the work.

## Design Principles
Beautiful by default. Less is more — remove unnecessary buttons, prefer whitespace over
separators, typography over decoration. Consistency — same spacing system, radius,
typography hierarchy, shadows, animations everywhere. Speed — the UI feels instant.
Focus — the manuscript is always the hero.

Inspiration: Apple, Linear, Notion, Figma, Affinity Publisher, Canva, Craft, Raycast.
Avoid: Windows-style interfaces, heavy gradients, skeuomorphism, visual clutter.

## Design Tokens (implemented in `src/index.css`)

### Colour
| Token | Light | Dark |
|---|---|---|
| Background | `#FAFAF8` | `#19191B` |
| Background Secondary | `#F2F2EE` | `#202023` |
| Sidebar | `#ECEBE7` | `#1E1E21` |
| Panel | `#FFFFFF` | `#222225` |
| Text Primary | `#1D1D1F` | `#F2F2F0` |
| Text Secondary | `#666666` | `#A8A8A8` |
| Muted Text | `#8A8A8A` | `#7A7A7A` |
| Border | `#E3E3E3` | `#313134` |
| Accent | `#4F8A5B` | `#5FA36C` |
| Success | `#3BA776` | `#4CC490` |
| Warning | `#D89B00` | `#E0AC33` |
| Danger | `#D84F4F` | `#E06868` |
| Selection | `#DDEFE0` | `#23362A` |
| Hover | `rgba(0,0,0,.04)` | `rgba(255,255,255,.06)` |

### Typography
Primary: Inter. Secondary: Source Serif 4. Scale: Display 56 / H1 40 / H2 32 / H3 26 /
H4 22 / H5 18 / Body Large 18 / Body 16 / Small 14 / Caption 12. Line heights: Display
1.1, Headings 1.2, Body 1.6, Captions 1.4. Never use inconsistent font sizes — always
use the tokens (Tailwind utilities `text-display`, `text-h1` … `text-caption`).

### Grid
8-point spacing system: 4, 8, 12, 16, 24, 32, 40, 48, 64, 80, 96. Tailwind's default
spacing scale already maps 1:1 to these values (`p-1`…`p-24`) — never introduce
arbitrary spacing.

### Radius
Buttons 12px, Cards 16px, Dialogs 20px, Images 16px, Preview strips 4px — exposed as
CSS variables `--radius-button/card/dialog/image/preview`.

### Shadows
Subtle only. `--shadow-sm` for cards/menus, `--shadow-md` for dialogs. Never dramatic.

### Icons
Lucide, stroke width 2. Never mix icon sets.

### Motion
150–250ms, eased (`--ease-standard`), never bouncy.

## Layout
Three-column shell — Sidebar (navigation) · Workspace (book preview, the centrepiece) ·
Inspector (context-sensitive, right). Toolbar fixed at the top of the centre column.
Navigation never moves. Implemented in `src/layout/`.

## Theme System (product feature, Phase 4)
Themes should feel like completely different books: Premium Nature (elegant serif,
whitespace, earth colours), Classic Novel (minimal, traditional), Educational (clear
hierarchy, coloured info boxes), Coffee Table (huge imagery, minimal text), Children's
(rounded type, playful spacing, bright colours). Every theme stays professional.

## Quality Standard
Every screen must pass: "Would this feel at home next to Apple, Figma or Affinity
software?" If no, redesign it.
