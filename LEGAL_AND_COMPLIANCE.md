# Legal, Privacy, and Compliance Documentation — CritEQ

**Application Name:** CritEQ  
**Bundle Identifier:** `com.criteq.app`  
**Version:** 1.0.0  
**License:** MIT License (with Acoustic & Hardware Safety Addendum)  
**Last Updated:** October 25, 2026

---

## 1. End-User License & Acoustic Safety Disclaimer

### 1.1 Software License
CritEQ is licensed under the **MIT License** (see [`LICENSE`](./LICENSE)). You are free to use, copy, modify, and distribute the software subject to the preservation of copyright and license notices.

### 1.2 Hearing Conservation & Audio Equipment Safety Notice
CritEQ is a real-time digital signal processing (DSP) utility capable of altering system-wide audio output:
- **Band Gain Range:** `-24.0 dB` to `+24.0 dB` per parametric band (up to 31 simultaneous bands).
- **Preamp Gain Range:** `-24.0 dB` to `+24.0 dB`.
- **Master Volume Scaling:** `0%` to `150%`.
- **Resonant Filter Topologies:** High-Q peaking, shelving, band-pass, and resonant low-pass/high-pass filters.

> **WARNING — HEARING & HARDWARE PROTECTION:**  
> Stacking multiple positive-gain bands, setting extreme Q factors, or applying positive preamp gain can dramatically increase output amplitude. Always lower your hardware monitoring volume before loading unfamiliar presets or applying large gain boosts.
>
> While CritEQ's native audio engine includes a continuous hyperbolic tangent (`tanh`) soft-clipping stage (`[-1.0, +1.0]` digital ceiling) to mitigate harsh digital overshoots, software limiting cannot prevent physical transducer excursion limits or unsafe acoustic Sound Pressure Levels (SPL). The authors and contributors of CritEQ accept **no liability** for hearing loss, tinnitus, or damage to speakers, headphones, DACs, or amplifiers resulting from the use or misuse of this software.

---

## 2. Privacy Policy & System Permissions Compliance

### 2.1 Zero Data Collection & 100% Offline Operation
CritEQ operates strictly as an offline, local desktop application:
- **No Telemetry or Analytics:** CritEQ contains no analytics SDKs, crash reporters, tracking pixels, or telemetry endpoints.
- **No Network Transmission:** CritEQ makes zero outbound network requests (`fetch`, `XMLHttpRequest`, WebSockets, or native sockets).
- **No User Accounts or PII:** CritEQ does not collect, store, or process any Personally Identifiable Information (PII).

### 2.2 macOS System Audio Capture (`CoreAudio` Process Tap) Disclosure
To equalize system-wide audio without requiring third-party kernel extensions (`.kext`) or virtual audio drivers, CritEQ utilizes Apple's official user-space **CoreAudio Process Tap API** (`CATapDescription` and `AudioHardwareCreateProcessTap`, introduced in macOS 14.2+) alongside Electron's media capture bridge (`MacSysAudioCapture`).

**How System Audio Is Handled:**
1. **Ephemeral In-Memory Processing Only:** Audio frames captured from the macOS system mix are processed in real-time within volatile RAM using `Float32` ring buffers (4096-frame loop buffer) and Direct Form II Transposed biquad filters.
2. **Zero Recording or Disk Persistence:** At no point is captured system audio written to disk, cached, encoded, or transmitted outside the local audio callback thread.
3. **Real-Time Spectrum Analysis:** When the spectrum analyzer (`RTA`) is enabled, decimated Fast Fourier Transform (`vDSP` / FFT) magnitude bins are computed in memory solely to render the visual frequency graph in the user interface and are immediately discarded on the next animation frame.

### 2.3 Local File System Access
CritEQ accesses the local file system exclusively in two contexts:
1. **Application State Persistence:** Saving and restoring your active EQ configuration (`criteq-state.json`) inside the standard OS application support directory (`~/Library/Application Support/CritEQ/` on macOS).
2. **User-Initiated Preset Import/Export:** Reading or writing `.txt`, `.peq`, or `.json` equalizer preset files only when explicitly selected by the user via the native OS Open/Save file dialog.

---

## 3. Intellectual Property & Clean-Room Engineering Compliance

### 3.1 Independent Clean-Room Implementation
CritEQ is an original, clean-room software implementation written in TypeScript and Swift:
- **Brand & Visual Identity:** CritEQ features an original studio-grade dark inspector UI (`Selected-Band Inspector Dock`, dual `Q | Oct` bandwidth readout, and custom vector rotary controls) and bears no affiliation with Bitgapp Ltd (`eqMac`), Jonas Thedering (`Equalizer APO`), or Apple Inc.
- **DSP Mathematics:** All biquad filter coefficients (`PK`, `LP`, `HP`, `LS`, `HS`, `BP`, `NO`, `AP`) are derived directly from first-principles public-domain bilinear transform equations published in **Robert Bristow-Johnson's *Audio EQ Cookbook***.

### 3.2 Preset Format Interoperability (`Equalizer APO` Compatibility)
CritEQ supports importing and exporting plain-text parametric EQ files (`.txt` / `.peq`) formatted using the `Preamp:` and `Filter <n>: ON <Type> Fc <Hz> Gain <dB> Q <val> / BW Oct <val>` syntax popularized by **Equalizer APO** and **AutoEQ**.
- Under international copyright law and fair-use interoperability doctrines, plain-text configuration syntax and numerical filter parameters (frequency, gain, quality factor) constitute uncopyrightable factual data and functional interfaces required for user data portability.

### 3.3 Trademark Disclaimer
- **Apple**, **macOS**, **CoreAudio**, **Accelerate**, and **vDSP** are trademarks of Apple Inc., registered in the U.S. and other countries.
- **Windows** and **WASAPI** are registered trademarks of Microsoft Corporation.
- **Equalizer APO** is the property of its respective authors.
- All other product names, headphone model names (in user-loaded presets), and trademarks are the property of their respective owners. Use of these names does not imply any affiliation with or endorsement by them.

---

## 4. Third-Party Open-Source Software Notices (SBOM)

CritEQ incorporates or interacts with the following open-source software packages and public-domain mathematical works:

### 4.1 Runtime Dependencies
| Component | Version | License | Copyright / Author |
| :--- | :--- | :--- | :--- |
| **Zod** (`zod`) | `^3.24.1` | MIT License | Copyright (c) 2020 Colin McDonnell (`colinhacks`) |
| **Electron** (`electron`) | `^45.0.0` | MIT License | Copyright (c) Electron contributors & GitHub Inc. |
| **Chromium** (via Electron) | Bundled | BSD-3-Clause / LGPL / MIT | Copyright (c) The Chromium Authors |
| **Node.js** (via Electron) | Bundled | MIT License | Copyright (c) OpenJS Foundation and Node.js contributors |

### 4.2 Mathematical & DSP References
- **Cookbook Formulae for Audio Equalizer Biquad Filter Coefficients**  
  Author: Robert Bristow-Johnson (`rbj@audioimagination.com`)  
  Status: Public Domain / Freely redistributable mathematical specification.

### 4.3 Operating System Frameworks (macOS)
CritEQ links dynamically against standard Apple system frameworks provided by macOS:
- `CoreAudio.framework` & `AudioToolbox.framework` (Hardware HAL, Process Tap, Aggregate Device management, and hardware volume synchronization)
- `Accelerate.framework` (`vDSP` hardware-accelerated vector operations)
- `Foundation.framework` & `AppKit.framework`

### 4.4 Full License Texts for Bundled MIT Components (`Zod` & `Electron`)
```text
Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

---

## 5. Regulatory, Distribution & Security Compliance

### 5.1 Electron Security Hardening Checklist
CritEQ enforces strict process isolation in [`src/main/main.ts`](./src/main/main.ts) and [`src/preload/preload.ts`](./src/preload/preload.ts):
- **`contextIsolation: true`**: Renderer scripts run in an isolated V8 context and cannot directly access Node.js primitives.
- **`nodeIntegration: false`**: Arbitrary Node.js execution in the renderer DOM is disabled.
- **`sandbox: true`**: The Chromium renderer process is OS-sandboxed.
- **Strict IPC Schema Validation (`Zod`)**: Every message crossing the `ipcMain.handle` boundary is validated at runtime against strict `Zod` schemas in [`src/main/ipc-handlers.ts`](./src/main/ipc-handlers.ts) before reaching the DSP engine or file system.

### 5.2 macOS Code Signing, Entitlements & Gatekeeper Compliance
- **Local Development / Standalone Build (`CritEQ.app`)**: Signed using ad-hoc deep code signing (`codesign --force --deep --sign -`).
- **Public Distribution Readiness (Apple Developer ID & Notarization)**: For external distribution outside the Mac App Store, CritEQ requires:
  1. Signing with a valid **Developer ID Application** certificate and Hardened Runtime (`--options runtime`).
  2. Including the `com.apple.security.device.audio-input` entitlement in `entitlements.plist` to authorize CoreAudio tap capture under Hardened Runtime.
  3. Providing `NSAudioCaptureUsageDescription` / `NSMicrophoneUsageDescription` strings in `Info.plist` explaining that audio access is used exclusively for real-time system equalization.
  4. Submitting the signed bundle to Apple's `notarytool` service and stapling the notarization ticket (`xcrun stapler staple CritEQ.app`).

### 5.3 Export Control Classification
CritEQ is a commercial/open-source audio digital signal processing utility and contains no proprietary cryptographic algorithms (`EAR99` / mass-market open-source exemption).
