<div align="center">

# 🎚️ CritEQ

**Mastering-Grade System-Wide Parametric Equalizer for macOS**  
*Built for Audio Engineers, IEM Enthusiasts, and Critical Listeners.*

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![Platform: macOS](https://img.shields.io/badge/Platform-macOS%2014.2%2B-black?logo=apple)](https://apple.com)
[![Windows Port: In Progress](https://img.shields.io/badge/Windows%20Port-In%20Progress%20%F0%9F%9A%A7-blue?logo=windows)](https://github.com/IniMaiss/CritEQ)
[![Presets: 5,900+](https://img.shields.io/badge/IEM%20Presets-5%2C900%2B-orange.svg)](./Preset)
[![Zero Telemetry](https://img.shields.io/badge/Telemetry-Zero%20%2F%20100%25%20Offline-success.svg)](./LEGAL_AND_COMPLIANCE.md)

<br/>
<br/>

<img src="./docs/screenshots/criteq-app-preview.png" alt="CritEQ Mastering Equalizer Interface" width="920" />

<br/>
<sub><em>Interactive Parametric EQ Canvas, Real-Time FFT Spectrum Analyzer, A/B Slot Auditioning, and Global EQ Scaling.</em></sub>

</div>

---

> [!NOTE]
> ### 🛡️ Independent Clean-Room Implementation
> **CritEQ is an independent, 100% clean-room open-source project written from scratch.**
> - **Architecture & Code:** All Swift native audio tapping code and TypeScript/Electron frontend logic were authored entirely from first principles. No proprietary code, binaries, or assets from third parties are used.
> - **Mathematical Foundation:** Filter calculations are derived from **Robert Bristow-Johnson's *Audio EQ Cookbook* (1994)**—the industry-standard, public-domain bilinear transform formulations utilized universally across digital audio workstations (DAWs) and audio plugins worldwide.
> - **Open Audio Standards:** Preset interoperability adheres strictly to open, plain-text parametric EQ formats popularized by Equalizer APO and AutoEq.

---

## 🌟 Overview

**CritEQ** brings mastering-studio precision to desktop system-wide audio. Designed with a minimalist dark obsidian aesthetic, CritEQ allows you to equalize any audio playing on your computer in real time with zero latency overhead and zero virtual driver clutter.

CritEQ comes bundled with an indexed database of **over 5,900+ headphone & IEM parametric EQ presets** sourced from the world's leading acoustic measurement databases (**AutoEq**, **Crinacle**, **Squiglink**, and **oratory1990**).

---

## 🛣️ Development Progress & Roadmap

CritEQ has been built iteratively with strict adherence to clean-room engineering, audio fidelity, and user experience:

- [x] **Phase 1 — Zero-Driver CoreAudio Engine (macOS)**
  - Implemented driverless system-wide audio capture via Apple Silicon process tap (`AudioHardwareCreateProcessTap` / `CATapDescription`).
  - Completely eliminates the need for third-party kernel extensions (`.kext`) or virtual audio driver daemons.
- [x] **Phase 2 — High-Precision Biquad DSP**
  - Engineered double-precision Direct Form II Transposed biquad filter topologies (`PK`, `LS`, `HS`, `LP`, `HP`, `BP`, `NO`, `AP`).
  - Added hardware-accelerated Apple Accelerate (`vDSP`) real-time FFT spectrum analyzer.
  - Implemented an internal soft-clipping `tanh` limiting stage for hearing conservation and signal protection.
- [x] **Phase 3 — 5,900+ Acoustic Preset Database**
  - Integrated and indexed over 5,900+ headphone and IEM measurement profiles.
  - Built instant client-side fuzzy search across manufacturers, models, and measurement reviewers.
  - Added full two-way Equalizer APO `.peq` and `.txt` import and export capabilities.
- [x] **Phase 4 — Minimalist Studio Precision Interface**
  - Clean obsidian canvas (*canvas polos*) that removes visual clutter and overlapping colored bell fills.
  - Razor-sharp hairline master response curve with subtle studio cyan telemetry.
  - Hollow precision reticle node handles with vertical alignment drop-guides.
  - Unified Selected-Band Inspector Dock with simultaneous `Q` and `Octaves` readouts, vector rotary dials, and A/B comparison slots.
- [ ] **Phase 5 — Windows Porting (In Active Progress 🚧)**
  - Architecting the native Windows audio backend utilizing **Windows Audio Session API (WASAPI)** and **Audio Processing Objects (APO)**.
  - Ensuring seamless cross-platform parity so Windows users can access the same driverless system-wide DSP, 5,900+ IEM presets, and minimalist UI.

---

## ✨ Features

- **🚀 Driverless System-Wide EQ (CoreAudio Process Tap):**
  Uses modern macOS user-space audio tapping (`AudioHardwareCreateProcessTap`). No kernel extensions, no Audio Server Plugins, and no system reboot required.
- **🎛️ Mastering-Grade DSP:**
  - Double-precision Direct Form II Transposed biquad filter topologies.
  - Supports Peaking (`PK`), Low-Shelf (`LS`), High-Shelf (`HS`), Low-Pass (`LP`), High-Pass (`HP`), Band-Pass (`BP`), Notch (`NO`), and All-Pass (`AP`).
  - Native soft-clipping `tanh` limiting stage preventing harsh digital overs.
- **📊 60 FPS Interactive Spectrum Canvas:**
  - Smooth interactive filter curve plotting with multi-band draggable node handles.
  - Real-time FFT spectrum analyzer (RTA) driven by hardware-accelerated Apple `vDSP`.
  - Dual `Q Factor` and `Bandwidth (Octaves)` live readout.
- **📚 5,900+ Pre-Calibrated IEM Presets:**
  - One-click tuning for brands like Moondrop, Sennheiser, Sony, KZ, Truthear, 64 Audio, DUNU, and hundreds more.
  - Fully compatible with **Equalizer APO** / **AutoEQ** `.txt` and `.peq` configuration files.
- **🔒 100% Offline & Private:**
  - Zero telemetry, zero analytics, zero network requests. Your audio stays purely in memory and never touches disk or external servers.

---

## 🎧 Presets & Measurement Rigs Notice

All presets included in CritEQ are pre-computed using the **AutoEq** optimization engine targeting the standard **Harman In-Ear 2019** or IEF Neutral target curves. 

The underlying frequency response measurements originate from:
- **[Squiglink Reviewers](https://squig.link)**: Measured primarily on standard **IEC 60318-4 (IEC-711 compliant / clone)** acoustic couplers.
- **[Crinacle](https://crinacle.com)**: Measured on **IEC-711** couplers and his high-resolution **Brüel & Kjær (B&K) Type 4620** measurement system.
- **[AutoEq / oratory1990](https://github.com/jaakkopasanen/AutoEq)**: Measured in controlled laboratory conditions using **GRAS 43AG / 45CA** ear simulators.

---

## 📥 Installation

### Download Pre-built Release
1. Go to the [**Releases**](https://github.com/IniMaiss/CritEQ/releases) page.
2. Download the latest `CritEQ-Installer.dmg` (for Apple Silicon macOS 14.2+).
3. Open the `.dmg` file and drag `CritEQ.app` into your `/Applications` folder.
4. Launch **CritEQ** and grant System Audio permissions when prompted by macOS.

---

## 🛠️ Building from Source

### Prerequisites
- macOS Sonoma 14.2 or later *(Windows support in active development)*
- [Node.js](https://nodejs.org) (v18 or later)
- Xcode Command Line Tools (`xcode-select --install`) with `swiftc`

### Setup & Run
```bash
# 1. Clone the repository
git clone https://github.com/IniMaiss/CritEQ.git
cd CritEQ

# 2. Install dependencies
npm install

# 3. Build native CoreAudio engine and TypeScript frontend
npm run build

# 4. Run in development mode
npm start
```

### Packaging macOS App (.app / .dmg)
```bash
# Package as a standalone macOS application
npm run package

# Create a distributable .dmg installer
hdiutil create -volname "CritEQ Installer" -srcfolder CritEQ.app -ov -format UDZO CritEQ-Installer.dmg
```

---

## 📖 File Format & Interoperability

CritEQ supports importing and exporting parametric EQ configurations compatible with **Equalizer APO**, **Peace EQ**, and **Wavelet**:

```text
Device: Moondrop Blessing 3 (Super Review)
Preamp: -4.8 dB
Filter 1: ON PK Fc 105 Hz Gain 3.2 dB Q 0.70
Filter 2: ON PK Fc 2800 Hz Gain -2.5 dB Q 1.40
Filter 3: ON HS Fc 10000 Hz Gain 1.5 dB Q 0.71
```

---

## 📜 License & Compliance

- **Software License:** Licensed under the [MIT License](./LICENSE).
- **Compliance & Safety:** See [LEGAL_AND_COMPLIANCE.md](./LEGAL_AND_COMPLIANCE.md) for full hearing conservation advisories, signal-flow guarantees, and third-party notices.
