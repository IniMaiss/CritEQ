<div align="center">

# 🎚️ CritEQ

**Mastering-Grade System-Wide Parametric Equalizer for macOS**  
*Built for Audio Engineers, IEM Enthusiasts, and Critical Listeners.*

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![Platform: macOS](https://img.shields.io/badge/Platform-macOS%2014.2%2B-black?logo=apple)](https://apple.com)
[![Presets: 5,900+](https://img.shields.io/badge/IEM%20Presets-5%2C900%2B-orange.svg)](./Preset)
[![Zero Telemetry](https://img.shields.io/badge/Telemetry-Zero%20%2F%20100%25%20Offline-success.svg)](./LEGAL_AND_COMPLIANCE.md)

</div>

---

> [!IMPORTANT]
> ### ⚠️ Disclaimer: Reverse Engineering & Prior Art Notice
> **CritEQ is an educational, clean-room reverse-engineering and research project inspired by [eqMac](https://eqmac.app) (developed by Bitgapp Ltd).**
> - CritEQ was created to study, analyze, and implement system-wide CoreAudio process tapping (`CATapDescription`) and studio-grade biquad filter DSP on modern Apple Silicon macOS systems without requiring third-party kernel extensions (`.kext`) or virtual audio drivers.
> - **No Proprietary Code Copied:** All DSP algorithms in CritEQ are derived independently from public-domain mathematical formulations (Robert Bristow-Johnson's *Audio EQ Cookbook*), and all Swift/TypeScript implementations were written clean-room.
> - **Non-Affiliation:** CritEQ is an independent open-source project and is **not affiliated with, sponsored by, endorsed by, or associated with Bitgapp Ltd or the authors of eqMac**. "eqMac" is the trademark of its respective owner. If you love eqMac, please support the original creators at [eqmac.app](https://eqmac.app).

---

## 🌟 Overview

**CritEQ** brings mastering-studio precision to desktop system-wide audio. Designed with a dark obsidian aesthetic inspired by high-end mastering plugins (FabFilter Pro-Q 3, Crave EQ), CritEQ allows you to equalize any audio playing on your Mac in real time with zero latency overhead and zero driver clutter.

CritEQ comes bundled with an indexed database of **over 5,900+ headphone & IEM parametric EQ presets** sourced from the world's leading acoustic measurement databases (**AutoEq**, **Crinacle**, **Squiglink**, and **oratory1990**).

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
- macOS Sonoma 14.2 or later
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
- **eqMac Reference:** As stated above, this software represents an independent reverse-engineered project created for educational exploration of user-space audio routing. All trademarks belong to their respective owners.
