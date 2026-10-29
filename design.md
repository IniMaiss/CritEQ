---
version: "3.0"
name: "Classic Light Paper Neobrutalism"
description: "Tactile, high-contrast parametric equalizer interface inspired by physical studio hardware and classic paper neobrutalism."
dial: "ENERGY 3 / RHYTHM 2 / MOTION 1"
colors:
  background: "#F4EFEA"
  background-secondary: "#FAF7F2"
  surface: "#FFFFFF"
  ink: "#000000"
  accent-primary: "#FFDE59"
  accent-solo: "#67E8F9"
  status-active: "#86EFAC"
  danger: "#FDA4AF"
  text-primary: "#000000"
  text-secondary: "#1F2937"
---

## Design Read & Identity

Reading this as: **Desktop Audio Mastering Parametric Equalizer** for **audio engineers, IEM enthusiasts, and critical listeners**, in a **Classic Light Paper Neobrutalism** visual language, dial **ENERGY 3 / RHYTHM 2 / MOTION 1**.

### Decision Log (R-31)
- **Why warm retro paper background (`#F4EFEA` / `#FAF7F2` / `#FFFFFF`)?** Replaces generic dark software templates with a distinctive tactile physical paper aesthetic that is inviting, high-contrast, and glare-free.
- **Why bold 2px solid black borders and 2-4px hard unblurred drop-shadows?** Hard geometric shadows without gaussian blur provide clear physical affordance and elevation hierarchy, avoiding the floating jelly feel of generic AI glassmorphism.
- **Why Neo-Yellow (`#FFDE59`) as the primary deliberate accent?** Yellow functions as a high-visibility highlighter for active band tabs, primary save actions, and the active curve HUD without overwhelming the workspace.
- **Why tactile mechanical click physics (`translate(1px, 1px)`)?** Gives interactive controls an immediate, satisfying physical snap that confirms user actions.
- **Why SF Pro Text / Inter (700-800) + JetBrains Mono (`tabular-nums`)?** Bold typography matches the stamped neobrutalist aesthetic while monospace tabular figures prevent telemetry horizontal jitter during live node dragging.
- **Why an expansive plain canvas (canvas polos) + selected-band inspector console?** Keeps the visual focus entirely on the acoustic EQ curve without rainbow visual clutter, while dedicating the bottom dock for deep parameter manipulation.
