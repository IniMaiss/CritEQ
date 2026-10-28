---
version: "2.0"
name: "Precision Mastering Dark"
description: "Mastering-grade parametric equalizer interface inspired by FabFilter Pro-Q 3 and Crave EQ."
dial: "ENERGY 2 / RHYTHM 2 / MOTION 1"
colors:
  background: "#0E1117"
  canvas: "#090B0F"
  surface: "#151922"
  surface-elevated: "#1C222E"
  accent-primary: "#F5A623"
  accent-secondary: "#38BDF8"
  danger: "#F43F5E"
  text-primary: "#F3F4F6"
  text-secondary: "#9CA3AF"
  border-hairline: "rgba(255, 255, 255, 0.08)"
---

## Design Read & Identity

Reading this as: **Desktop Audio Mastering Parametric Equalizer** for **audio engineers, IEM enthusiasts, and critical listeners**, in a **Precision Mastering Dark** visual language, dial **ENERGY 2 / RHYTHM 2 / MOTION 1**.

### Decision Log (R-31)
- **Why dark obsidian surfaces (`#090B0F` / `#0E1117` / `#151922`)?** A recessed, low-glare acoustic canvas lets translucent multi-band filter curves and real-time FFT spectrum splines read with maximum contrast without eye fatigue during long tuning sessions.
- **Why warm mastering amber (`#F5A623`) as the primary deliberate accent?** Warm amber/gold provides an unmistakable focal point for the master composite response, active Solo state, and selected node HUD against cool obsidian slate surfaces.
- **Why 1px hairline borders (`rgba(255, 255, 255, 0.08)`) instead of thick outlines?** Precision audio tools require dense numerical telemetry and uncluttered filter geometry; 1px structural hairlines separate functional zones without competing with the 10 Hz - 24 kHz graph.
- **Why SF Pro Text / Inter (500-600) + JetBrains Mono (`tabular-nums`)?** UI labels stay calm and scannable while live-updating Hz, dB, and Q values never jitter horizontally when dragging nodes at 60 FPS.
- **Why an interactive graph primary viewport + modular channel strip console?** The frequency response curve is the primary focal point on screen; the lower band console provides precision fine-tuning for individual filter parameters.
