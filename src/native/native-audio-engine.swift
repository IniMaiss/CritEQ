import CoreAudio
import AudioToolbox
import Accelerate
import Foundation

// MARK: - Filter Types
enum FilterType: String, Codable {
    case peak = "peak"
    case lowShelf = "lowShelf"
    case highShelf = "highShelf"
    case highPass = "highPass"
    case lowPass = "lowPass"
    case notch = "notch"
    case bandPass = "bandPass"
}

// MARK: - Band Config
struct BandConfig: Codable {
    let index: Int
    let frequency: Double
    let gain: Double
    let q: Double
    let filterType: FilterType
    let isEnabled: Bool
    let channel: String?
}

// MARK: - Incoming Commands
struct CommandPayload: Codable {
    let type: String
    let bands: [BandConfig]?
    let preamp: Double?
    let bypass: Bool?
    let volume: Double?
    let deviceId: UInt32?
}

// MARK: - 64-Bit Double Biquad Coefficients & Transposed Direct Form II State
struct BiquadCoefficients {
    var b0: Double = 1.0
    var b1: Double = 0.0
    var b2: Double = 0.0
    var a1: Double = 0.0
    var a2: Double = 0.0
    var applyL: Bool = false
    var applyR: Bool = false
}

struct BiquadState {
    var z1: Double = 0.0
    var z2: Double = 0.0

    // Smoothed running coefficients to prevent zipper noise / clicks when dragging bands
    var curB0: Double = 1.0
    var curB1: Double = 0.0
    var curB2: Double = 0.0
    var curA1: Double = 0.0
    var curA2: Double = 0.0
    var initialized: Bool = false

    @inline(__always)
    mutating func snapTo(_ target: BiquadCoefficients) {
        curB0 = target.b0
        curB1 = target.b1
        curB2 = target.b2
        curA1 = target.a1
        curA2 = target.a2
        initialized = true
    }

    @inline(__always)
    mutating func process(sample: Double, target: BiquadCoefficients, smooth: Double) -> Double {
        if !initialized {
            snapTo(target)
        } else {
            curB0 += (target.b0 - curB0) * smooth
            curB1 += (target.b1 - curB1) * smooth
            curB2 += (target.b2 - curB2) * smooth
            curA1 += (target.a1 - curA1) * smooth
            curA2 += (target.a2 - curA2) * smooth
        }

        // Transposed Direct Form II (64-bit Double precision)
        let out = curB0 * sample + z1
        if out.isFinite {
            z1 = curB1 * sample - curA1 * out + z2
            z2 = curB2 * sample - curA2 * out
            return out
        } else {
            reset()
            return sample
        }
    }

    mutating func reset() {
        z1 = 0.0
        z2 = 0.0
        curB0 = 1.0
        curB1 = 0.0
        curB2 = 0.0
        curA1 = 0.0
        curA2 = 0.0
        initialized = false
    }
}

// MARK: - Coefficient Calculator (64-bit RBJ Audio EQ Cookbook)
func computeCoefficients(band: BandConfig, sampleRate: Double) -> BiquadCoefficients {
    let ch = band.channel ?? "all"
    let applyL = (ch == "all" || ch == "left")
    let applyR = (ch == "all" || ch == "right")

    guard band.isEnabled else {
        return BiquadCoefficients(b0: 1.0, b1: 0.0, b2: 0.0, a1: 0.0, a2: 0.0, applyL: false, applyR: false)
    }

    // If a peaking or shelf filter has effectively 0 dB gain, keep it unity pass-through
    if (band.filterType == .peak || band.filterType == .lowShelf || band.filterType == .highShelf) && abs(band.gain) < 1e-4 {
        return BiquadCoefficients(b0: 1.0, b1: 0.0, b2: 0.0, a1: 0.0, a2: 0.0, applyL: applyL, applyR: applyR)
    }

    let f0 = max(10.0, min(sampleRate * 0.49, band.frequency))
    let q = max(0.05, min(30.0, band.q))
    let gainDB = max(-30.0, min(30.0, band.gain))
    let A = pow(10.0, gainDB / 40.0)
    let w0 = 2.0 * Double.pi * f0 / sampleRate
    let cosW0 = cos(w0)
    let sinW0 = sin(w0)
    let alpha = sinW0 / (2.0 * q)

    var b0 = 1.0, b1 = 0.0, b2 = 0.0, a0 = 1.0, a1 = 0.0, a2 = 0.0

    switch band.filterType {
    case .peak:
        b0 = 1.0 + alpha * A
        b1 = -2.0 * cosW0
        b2 = 1.0 - alpha * A
        a0 = 1.0 + alpha / A
        a1 = -2.0 * cosW0
        a2 = 1.0 - alpha / A

    case .lowShelf:
        let sqrtA = sqrt(A)
        let twoSqrtAAlpha = 2.0 * sqrtA * alpha
        b0 = A * ((A + 1.0) - (A - 1.0) * cosW0 + twoSqrtAAlpha)
        b1 = 2.0 * A * ((A - 1.0) - (A + 1.0) * cosW0)
        b2 = A * ((A + 1.0) - (A - 1.0) * cosW0 - twoSqrtAAlpha)
        a0 = (A + 1.0) + (A - 1.0) * cosW0 + twoSqrtAAlpha
        a1 = -2.0 * ((A - 1.0) + (A + 1.0) * cosW0)
        a2 = (A + 1.0) + (A - 1.0) * cosW0 - twoSqrtAAlpha

    case .highShelf:
        let sqrtA = sqrt(A)
        let twoSqrtAAlpha = 2.0 * sqrtA * alpha
        b0 = A * ((A + 1.0) + (A - 1.0) * cosW0 + twoSqrtAAlpha)
        b1 = -2.0 * A * ((A - 1.0) + (A + 1.0) * cosW0)
        b2 = A * ((A + 1.0) + (A - 1.0) * cosW0 - twoSqrtAAlpha)
        a0 = (A + 1.0) - (A - 1.0) * cosW0 + twoSqrtAAlpha
        a1 = 2.0 * ((A - 1.0) - (A + 1.0) * cosW0)
        a2 = (A + 1.0) - (A - 1.0) * cosW0 - twoSqrtAAlpha

    case .highPass:
        b0 = (1.0 + cosW0) / 2.0
        b1 = -(1.0 + cosW0)
        b2 = (1.0 + cosW0) / 2.0
        a0 = 1.0 + alpha
        a1 = -2.0 * cosW0
        a2 = 1.0 - alpha

    case .lowPass:
        b0 = (1.0 - cosW0) / 2.0
        b1 = 1.0 - cosW0
        b2 = (1.0 - cosW0) / 2.0
        a0 = 1.0 + alpha
        a1 = -2.0 * cosW0
        a2 = 1.0 - alpha

    case .notch:
        b0 = 1.0
        b1 = -2.0 * cosW0
        b2 = 1.0
        a0 = 1.0 + alpha
        a1 = -2.0 * cosW0
        a2 = 1.0 - alpha

    case .bandPass:
        b0 = alpha
        b1 = 0.0
        b2 = -alpha
        a0 = 1.0 + alpha
        a1 = -2.0 * cosW0
        a2 = 1.0 - alpha
    }

    let invA0 = 1.0 / (a0 != 0.0 ? a0 : 1.0)
    return BiquadCoefficients(
        b0: b0 * invA0,
        b1: b1 * invA0,
        b2: b2 * invA0,
        a1: a1 * invA0,
        a2: a2 * invA0,
        applyL: applyL,
        applyR: applyR
    )
}

// MARK: - Main Engine Class
final class NativeAudioEngine {
    private var tapID: AudioObjectID = kAudioObjectUnknown
    private var aggID: AudioObjectID = kAudioObjectUnknown
    private var outputDeviceID: AudioObjectID = kAudioObjectUnknown
    private var watchedDeviceID: AudioObjectID = kAudioObjectUnknown
    private var ioProcID: AudioDeviceIOProcID? = nil

    private let listenerQueue = DispatchQueue(label: "com.criteq.native.device-listener")
    private var hardwareListenersRegistered = false
    private var deviceListListenerBlock: AudioObjectPropertyListenerBlock?
    private var defaultOutputListenerBlock: AudioObjectPropertyListenerBlock?
    private var dataSourceListenerBlock: AudioObjectPropertyListenerBlock?
    private var sampleRateListenerBlock: AudioObjectPropertyListenerBlock?
    private var volumeListenerBlock: AudioObjectPropertyListenerBlock?
    private var muteListenerBlock: AudioObjectPropertyListenerBlock?
    private var lastVolumeSetTimestamp: Double = 0

    private var sampleRate: Double = 48000.0
    private let maxBands = 32
    private var activeBandCount = 0
    private var cachedBands: [BandConfig] = []
    private var bandCoeffs: [BiquadCoefficients]
    private var statesL: [BiquadState]
    private var statesR: [BiquadState]

    private var isBypassed = false
    private var targetPreampGain: Double = 1.0
    private var currentPreampGain: Double = 1.0
    private var targetMasterVolume: Double = 1.0
    private var currentMasterVolume: Double = 1.0

    // Transparent Stereo-Linked Peak Limiter state (prevents 0 dBFS clipping when boosting bands)
    private var limiterGain: Double = 1.0
    private let limiterCeiling: Double = 0.985

    private let lock = os_unfair_lock_t.allocate(capacity: 1)

    // Telemetry
    private var peakL: Float = 0.0
    private var peakR: Float = 0.0
    private var sumSquaresL: Float = 0.0
    private var sumSquaresR: Float = 0.0
    private var sampleCount: Int = 0

    // FFT Setup (vDSP, 2048-point Hann window, pre-allocated buffers for zero lock allocations)
    private let fftSize = 2048
    private let log2n: vDSP_Length = 11
    private var fftSetup: FFTSetup?
    private var fftWindow: [Float]
    private var fftInputBuffer: [Float]
    private var fftSnapshotBuffer: [Float]
    private var fftWindowedBuffer: [Float]
    private var fftRealBuffer: [Float]
    private var fftImagBuffer: [Float]
    private var fftMagBuffer: [Float]
    private var fftWriteHead = 0

    init() {
        self.bandCoeffs = Array(repeating: BiquadCoefficients(), count: maxBands)
        self.statesL = Array(repeating: BiquadState(), count: maxBands)
        self.statesR = Array(repeating: BiquadState(), count: maxBands)
        self.lock.initialize(to: os_unfair_lock())

        self.fftSetup = vDSP_create_fftsetup(log2n, FFTRadix(kFFTRadix2))
        self.fftWindow = [Float](repeating: 0, count: fftSize)
        vDSP_hann_window(&fftWindow, vDSP_Length(fftSize), Int32(vDSP_HANN_NORM))
        self.fftInputBuffer = [Float](repeating: 0, count: fftSize)
        self.fftSnapshotBuffer = [Float](repeating: 0, count: fftSize)
        self.fftWindowedBuffer = [Float](repeating: 0, count: fftSize)
        self.fftRealBuffer = [Float](repeating: 0, count: fftSize / 2)
        self.fftImagBuffer = [Float](repeating: 0, count: fftSize / 2)
        self.fftMagBuffer = [Float](repeating: 0, count: fftSize / 2)
    }

    deinit {
        unregisterDevicePropertyListeners()
        unregisterHardwareListeners()
        stop()
        if let setup = fftSetup {
            vDSP_destroy_fftsetup(setup)
        }
        lock.deallocate()
    }

    func start(preferredDeviceID: AudioObjectID? = nil) -> Bool {
        registerHardwareListenersIfNeeded()

        // 1. Identify output device and query nominal sample rate
        if let preferred = preferredDeviceID, preferred != kAudioObjectUnknown, isValidPhysicalOutputDevice(preferred) {
            self.outputDeviceID = preferred
            querySampleRate(for: preferred)
        } else {
            findDefaultOutputDevice()
        }

        // 2. Translate PID to AudioObjectID to exclude ourselves from the tap
        let myPID = getpid()
        var propertyAddress = AudioObjectPropertyAddress(
            mSelector: kAudioHardwarePropertyTranslatePIDToProcessObject,
            mScope: kAudioObjectPropertyScopeGlobal,
            mElement: kAudioObjectPropertyElementMain
        )
        var myAudioObjectID: AudioObjectID = kAudioObjectUnknown
        var size = UInt32(MemoryLayout<AudioObjectID>.size)
        var pidCopy = myPID
        let pidStatus = AudioObjectGetPropertyData(
            AudioObjectID(kAudioObjectSystemObject),
            &propertyAddress,
            UInt32(MemoryLayout<pid_t>.size),
            &pidCopy,
            &size,
            &myAudioObjectID
        )
        guard pidStatus == noErr else {
            fputs("Failed to translate PID to AudioObjectID\n", stderr)
            return false
        }

        // 3. Create CoreAudio Process Tap excluding self, with muteBehavior = .muted
        let desc = CATapDescription(stereoGlobalTapButExcludeProcesses: [myAudioObjectID])
        desc.muteBehavior = .muted
        let tapStatus = AudioHardwareCreateProcessTap(desc, &tapID)
        guard tapStatus == noErr else {
            fputs("Failed to create process tap: \(tapStatus)\n", stderr)
            return false
        }

        // 4. Query output device UID with proper ARC ownership
        let outputUID = getDeviceUID(outputDeviceID) ?? "BuiltInSpeakerDevice"

        // 5. Create Aggregate Device with proper SubDevice dictionary + SubTap dictionary
        let aggregateUID = UUID().uuidString
        let aggregateDescription: [String: Any] = [
            kAudioAggregateDeviceNameKey: "CritEQProcessTapAggregate",
            kAudioAggregateDeviceUIDKey: aggregateUID,
            kAudioAggregateDeviceIsPrivateKey: true,
            kAudioAggregateDeviceMainSubDeviceKey: outputUID,
            kAudioAggregateDeviceSubDeviceListKey: [
                [
                    kAudioSubDeviceUIDKey: outputUID
                ]
            ],
            kAudioAggregateDeviceTapListKey: [
                [
                    kAudioSubTapUIDKey: desc.uuid.uuidString,
                    kAudioSubTapDriftCompensationKey: true
                ]
            ]
        ]
        let aggStatus = AudioHardwareCreateAggregateDevice(aggregateDescription as CFDictionary, &aggID)
        guard aggStatus == noErr else {
            AudioHardwareDestroyProcessTap(tapID)
            tapID = kAudioObjectUnknown
            fputs("Failed to create aggregate device: \(aggStatus)\n", stderr)
            return false
        }

        // Query actual sample rate from the Aggregate Device
        querySampleRate(for: aggID)

        // Reset filter states and recompute coefficients for active sample rate
        os_unfair_lock_lock(lock)
        limiterGain = 1.0
        for b in 0..<maxBands {
            statesL[b].reset()
            statesR[b].reset()
        }
        recomputeAllBandsLocked(snapStates: true)
        os_unfair_lock_unlock(lock)

        // 6. Single Synchronous IOProc on the Aggregate Device (Input = Tap, Output = Speaker/Headphones)
        let ioStatus = AudioDeviceCreateIOProcIDWithBlock(&ioProcID, aggID, nil) { [weak self] _, inInputData, _, outOutputData, _ in
            self?.handleSynchronousAudioIO(inInputData: inInputData, outOutputData: outOutputData)
        }
        guard ioStatus == noErr else {
            stop()
            return false
        }

        AudioDeviceStart(aggID, ioProcID)
        registerDevicePropertyListeners(for: outputDeviceID)
        fputs("Native audio engine active on device ID \(outputDeviceID) (\(outputUID)) @ \(sampleRate) Hz\n", stderr)
        emitOutputDevicesJSON()
        return true
    }

    func stop() {
        unregisterDevicePropertyListeners()
        if let proc = ioProcID {
            AudioDeviceStop(aggID, proc)
            AudioDeviceDestroyIOProcID(aggID, proc)
            ioProcID = nil
        }
        if aggID != kAudioObjectUnknown {
            AudioHardwareDestroyAggregateDevice(aggID)
            aggID = kAudioObjectUnknown
        }
        if tapID != kAudioObjectUnknown {
            AudioHardwareDestroyProcessTap(tapID)
            tapID = kAudioObjectUnknown
        }
    }

    func switchOutputDevice(_ newDeviceID: AudioObjectID) {
        listenerQueue.async { [weak self] in
            guard let self = self else { return }
            guard newDeviceID != kAudioObjectUnknown && self.isValidPhysicalOutputDevice(newDeviceID) else {
                self.emitOutputDevicesJSON()
                return
            }
            self.setSystemDefaultOutputDevice(newDeviceID)
            if newDeviceID == self.outputDeviceID && self.ioProcID != nil {
                self.emitOutputDevicesJSON()
                return
            }
            fputs("Switching output device from \(self.outputDeviceID) to \(newDeviceID)\n", stderr)
            self.stop()
            if !self.start(preferredDeviceID: newDeviceID) {
                _ = self.start(preferredDeviceID: nil)
            }
        }
    }

    private func setSystemDefaultOutputDevice(_ deviceID: AudioObjectID) {
        guard deviceID != kAudioObjectUnknown && isValidPhysicalOutputDevice(deviceID) else { return }
        var mutableID = deviceID
        let size = UInt32(MemoryLayout<AudioDeviceID>.size)

        var defaultOutAddress = AudioObjectPropertyAddress(
            mSelector: kAudioHardwarePropertyDefaultOutputDevice,
            mScope: kAudioObjectPropertyScopeGlobal,
            mElement: kAudioObjectPropertyElementMain
        )
        AudioObjectSetPropertyData(
            AudioObjectID(kAudioObjectSystemObject),
            &defaultOutAddress,
            0,
            nil,
            size,
            &mutableID
        )

        var systemOutAddress = AudioObjectPropertyAddress(
            mSelector: kAudioHardwarePropertyDefaultSystemOutputDevice,
            mScope: kAudioObjectPropertyScopeGlobal,
            mElement: kAudioObjectPropertyElementMain
        )
        AudioObjectSetPropertyData(
            AudioObjectID(kAudioObjectSystemObject),
            &systemOutAddress,
            0,
            nil,
            size,
            &mutableID
        )
    }

    // MARK: - Hot-Plug & Default Output Device Listeners (Earphones / USB / Bluetooth / HDMI)
    private func registerHardwareListenersIfNeeded() {
        guard !hardwareListenersRegistered else { return }
        hardwareListenersRegistered = true

        var devicesAddress = AudioObjectPropertyAddress(
            mSelector: kAudioHardwarePropertyDevices,
            mScope: kAudioObjectPropertyScopeGlobal,
            mElement: kAudioObjectPropertyElementMain
        )
        let devBlock: AudioObjectPropertyListenerBlock = { [weak self] _, _ in
            self?.handleHardwareDevicesOrDefaultChanged()
        }
        self.deviceListListenerBlock = devBlock
        AudioObjectAddPropertyListenerBlock(
            AudioObjectID(kAudioObjectSystemObject),
            &devicesAddress,
            listenerQueue,
            devBlock
        )

        var defaultOutAddress = AudioObjectPropertyAddress(
            mSelector: kAudioHardwarePropertyDefaultOutputDevice,
            mScope: kAudioObjectPropertyScopeGlobal,
            mElement: kAudioObjectPropertyElementMain
        )
        let defBlock: AudioObjectPropertyListenerBlock = { [weak self] _, _ in
            self?.handleHardwareDevicesOrDefaultChanged()
        }
        self.defaultOutputListenerBlock = defBlock
        AudioObjectAddPropertyListenerBlock(
            AudioObjectID(kAudioObjectSystemObject),
            &defaultOutAddress,
            listenerQueue,
            defBlock
        )
    }

    private func unregisterHardwareListeners() {
        guard hardwareListenersRegistered else { return }
        hardwareListenersRegistered = false

        if let devBlock = deviceListListenerBlock {
            var devicesAddress = AudioObjectPropertyAddress(
                mSelector: kAudioHardwarePropertyDevices,
                mScope: kAudioObjectPropertyScopeGlobal,
                mElement: kAudioObjectPropertyElementMain
            )
            AudioObjectRemovePropertyListenerBlock(
                AudioObjectID(kAudioObjectSystemObject),
                &devicesAddress,
                listenerQueue,
                devBlock
            )
            deviceListListenerBlock = nil
        }

        if let defBlock = defaultOutputListenerBlock {
            var defaultOutAddress = AudioObjectPropertyAddress(
                mSelector: kAudioHardwarePropertyDefaultOutputDevice,
                mScope: kAudioObjectPropertyScopeGlobal,
                mElement: kAudioObjectPropertyElementMain
            )
            AudioObjectRemovePropertyListenerBlock(
                AudioObjectID(kAudioObjectSystemObject),
                &defaultOutAddress,
                listenerQueue,
                defBlock
            )
            defaultOutputListenerBlock = nil
        }
    }

    private func registerDevicePropertyListeners(for deviceID: AudioObjectID) {
        unregisterDevicePropertyListeners()
        guard deviceID != kAudioObjectUnknown else { return }
        watchedDeviceID = deviceID

        // Watch DataSource changes (e.g. MacBook 3.5mm jack switching Internal Speakers <-> External Headphones)
        var dsAddress = AudioObjectPropertyAddress(
            mSelector: kAudioDevicePropertyDataSource,
            mScope: kAudioObjectPropertyScopeOutput,
            mElement: kAudioObjectPropertyElementMain
        )
        let dsBlock: AudioObjectPropertyListenerBlock = { [weak self] _, _ in
            guard let self = self else { return }
            self.handleHardwareDevicesOrDefaultChanged()
        }
        self.dataSourceListenerBlock = dsBlock
        AudioObjectAddPropertyListenerBlock(deviceID, &dsAddress, listenerQueue, dsBlock)

        // Watch NominalSampleRate changes on the output device
        var srAddress = AudioObjectPropertyAddress(
            mSelector: kAudioDevicePropertyNominalSampleRate,
            mScope: kAudioObjectPropertyScopeGlobal,
            mElement: kAudioObjectPropertyElementMain
        )
        let srBlock: AudioObjectPropertyListenerBlock = { [weak self] _, _ in
            guard let self = self else { return }
            let oldSR = self.sampleRate
            self.querySampleRate(for: self.outputDeviceID)
            if abs(self.sampleRate - oldSR) > 1.0 {
                os_unfair_lock_lock(self.lock)
                self.recomputeAllBandsLocked(snapStates: true)
                os_unfair_lock_unlock(self.lock)
            }
            self.emitOutputDevicesJSON()
        }
        self.sampleRateListenerBlock = srBlock
        AudioObjectAddPropertyListenerBlock(deviceID, &srAddress, listenerQueue, srBlock)

        // Watch Volume & Mute changes on the active Mac output device across all standard channels
        let volBlock: AudioObjectPropertyListenerBlock = { [weak self] _, _ in
            guard let self = self else { return }
            if ProcessInfo.processInfo.systemUptime - self.lastVolumeSetTimestamp > 0.15 {
                self.emitOutputDevicesJSON()
            }
        }
        self.volumeListenerBlock = volBlock
        for elem: UInt32 in [kAudioObjectPropertyElementMain, 1, 2] {
            var volAddress = AudioObjectPropertyAddress(
                mSelector: kAudioDevicePropertyVolumeScalar,
                mScope: kAudioObjectPropertyScopeOutput,
                mElement: elem
            )
            if AudioObjectHasProperty(deviceID, &volAddress) {
                AudioObjectAddPropertyListenerBlock(deviceID, &volAddress, listenerQueue, volBlock)
            }
        }

        let muteBlock: AudioObjectPropertyListenerBlock = { [weak self] _, _ in
            guard let self = self else { return }
            if ProcessInfo.processInfo.systemUptime - self.lastVolumeSetTimestamp > 0.15 {
                self.emitOutputDevicesJSON()
            }
        }
        self.muteListenerBlock = muteBlock
        for elem: UInt32 in [kAudioObjectPropertyElementMain, 1, 2] {
            var muteAddress = AudioObjectPropertyAddress(
                mSelector: kAudioDevicePropertyMute,
                mScope: kAudioObjectPropertyScopeOutput,
                mElement: elem
            )
            if AudioObjectHasProperty(deviceID, &muteAddress) {
                AudioObjectAddPropertyListenerBlock(deviceID, &muteAddress, listenerQueue, muteBlock)
            }
        }
    }

    private func unregisterDevicePropertyListeners() {
        guard watchedDeviceID != kAudioObjectUnknown else { return }
        if let dsBlock = dataSourceListenerBlock {
            var dsAddress = AudioObjectPropertyAddress(
                mSelector: kAudioDevicePropertyDataSource,
                mScope: kAudioObjectPropertyScopeOutput,
                mElement: kAudioObjectPropertyElementMain
            )
            AudioObjectRemovePropertyListenerBlock(watchedDeviceID, &dsAddress, listenerQueue, dsBlock)
            dataSourceListenerBlock = nil
        }
        if let srBlock = sampleRateListenerBlock {
            var srAddress = AudioObjectPropertyAddress(
                mSelector: kAudioDevicePropertyNominalSampleRate,
                mScope: kAudioObjectPropertyScopeGlobal,
                mElement: kAudioObjectPropertyElementMain
            )
            AudioObjectRemovePropertyListenerBlock(watchedDeviceID, &srAddress, listenerQueue, srBlock)
            sampleRateListenerBlock = nil
        }
        if let volBlock = volumeListenerBlock {
            for elem: UInt32 in [kAudioObjectPropertyElementMain, 1, 2] {
                var volAddress = AudioObjectPropertyAddress(
                    mSelector: kAudioDevicePropertyVolumeScalar,
                    mScope: kAudioObjectPropertyScopeOutput,
                    mElement: elem
                )
                AudioObjectRemovePropertyListenerBlock(watchedDeviceID, &volAddress, listenerQueue, volBlock)
            }
            volumeListenerBlock = nil
        }
        if let muteBlock = muteListenerBlock {
            for elem: UInt32 in [kAudioObjectPropertyElementMain, 1, 2] {
                var muteAddress = AudioObjectPropertyAddress(
                    mSelector: kAudioDevicePropertyMute,
                    mScope: kAudioObjectPropertyScopeOutput,
                    mElement: elem
                )
                AudioObjectRemovePropertyListenerBlock(watchedDeviceID, &muteAddress, listenerQueue, muteBlock)
            }
            muteListenerBlock = nil
        }
        watchedDeviceID = kAudioObjectUnknown
    }

    private func handleHardwareDevicesOrDefaultChanged() {
        // Brief settle delay (50ms) so CoreAudio finishes activating newly plugged-in earphones/DAC
        listenerQueue.asyncAfter(deadline: .now() + .milliseconds(50)) { [weak self] in
            guard let self = self else { return }
            let newDefault = self.queryBestDefaultOutputDevice()
            let currentValid = self.isValidPhysicalOutputDevice(self.outputDeviceID)

            if !currentValid || (newDefault != kAudioObjectUnknown && newDefault != self.outputDeviceID) {
                let target = newDefault != kAudioObjectUnknown ? newDefault : self.outputDeviceID
                self.stop()
                _ = self.start(preferredDeviceID: target)
            } else {
                self.emitOutputDevicesJSON()
            }
        }
    }

    // MARK: - Device Enumeration & Inspection Helpers
    private func getDeviceName(_ id: AudioObjectID) -> String? {
        var nameAddress = AudioObjectPropertyAddress(
            mSelector: kAudioObjectPropertyName,
            mScope: kAudioObjectPropertyScopeGlobal,
            mElement: kAudioObjectPropertyElementMain
        )
        var cfName: Unmanaged<CFString>?
        var nameSize = UInt32(MemoryLayout<Unmanaged<CFString>?>.size)
        guard AudioObjectGetPropertyData(id, &nameAddress, 0, nil, &nameSize, &cfName) == noErr,
              let baseName = cfName?.takeRetainedValue() as String? else {
            return nil
        }

        // Check if active output DataSource gives a more specific port name (e.g., "External Headphones")
        var dsProp = AudioObjectPropertyAddress(
            mSelector: kAudioDevicePropertyDataSource,
            mScope: kAudioObjectPropertyScopeOutput,
            mElement: kAudioObjectPropertyElementMain
        )
        var sourceID: UInt32 = 0
        var dsSize = UInt32(MemoryLayout<UInt32>.size)
        if AudioObjectGetPropertyData(id, &dsProp, 0, nil, &dsSize, &sourceID) == noErr && sourceID != 0 {
            var dsNameProp = AudioObjectPropertyAddress(
                mSelector: kAudioDevicePropertyDataSourceNameForIDCFString,
                mScope: kAudioObjectPropertyScopeOutput,
                mElement: kAudioObjectPropertyElementMain
            )
            var cfDSName: Unmanaged<CFString>? = nil
            let status: OSStatus = withUnsafeMutablePointer(to: &sourceID) { inPtr in
                withUnsafeMutablePointer(to: &cfDSName) { outPtr in
                    var trans = AudioValueTranslation(
                        mInputData: inPtr,
                        mInputDataSize: UInt32(MemoryLayout<UInt32>.size),
                        mOutputData: outPtr,
                        mOutputDataSize: UInt32(MemoryLayout<Unmanaged<CFString>?>.size)
                    )
                    var transSize = UInt32(MemoryLayout<AudioValueTranslation>.size)
                    return AudioObjectGetPropertyData(id, &dsNameProp, 0, nil, &transSize, &trans)
                }
            }
            if status == noErr, let dsName = cfDSName?.takeRetainedValue() as String?, !dsName.isEmpty {
                return dsName
            }
        }

        return baseName
    }

    private func getDeviceUID(_ id: AudioObjectID) -> String? {
        var uidAddress = AudioObjectPropertyAddress(
            mSelector: kAudioDevicePropertyDeviceUID,
            mScope: kAudioObjectPropertyScopeGlobal,
            mElement: kAudioObjectPropertyElementMain
        )
        var cfUID: Unmanaged<CFString>?
        var uidSize = UInt32(MemoryLayout<Unmanaged<CFString>?>.size)
        if AudioObjectGetPropertyData(id, &uidAddress, 0, nil, &uidSize, &cfUID) == noErr {
            return cfUID?.takeRetainedValue() as String?
        }
        return nil
    }

    private func isValidPhysicalOutputDevice(_ id: AudioObjectID) -> Bool {
        guard id != kAudioObjectUnknown && id != aggID else { return false }

        var streamAddress = AudioObjectPropertyAddress(
            mSelector: kAudioDevicePropertyStreams,
            mScope: kAudioObjectPropertyScopeOutput,
            mElement: kAudioObjectPropertyElementMain
        )
        var streamSize: UInt32 = 0
        guard AudioObjectGetPropertyDataSize(id, &streamAddress, 0, nil, &streamSize) == noErr && streamSize > 0 else {
            return false
        }

        var aliveAddress = AudioObjectPropertyAddress(
            mSelector: kAudioDevicePropertyDeviceIsAlive,
            mScope: kAudioObjectPropertyScopeGlobal,
            mElement: kAudioObjectPropertyElementMain
        )
        var isAlive: UInt32 = 1
        var aliveSize = UInt32(MemoryLayout<UInt32>.size)
        if AudioObjectGetPropertyData(id, &aliveAddress, 0, nil, &aliveSize, &isAlive) == noErr && isAlive == 0 {
            return false
        }

        let name = getDeviceName(id) ?? ""
        let uid = getDeviceUID(id) ?? ""
        if name.contains("CritEQProcessTapAggregate") ||
           name.contains("eqMacProcessTapAggregate") ||
           name.contains("CADefaultDeviceAggregate") ||
           name.contains("(eqMac)") ||
           name.contains("eqMac Export") ||
           uid.contains("EQMOutputCapture") ||
           uid.contains("eqMac") {
            return false
        }

        return true
    }

    private func getAllPhysicalOutputDevices() -> [(id: AudioObjectID, name: String, uid: String)] {
        var propAddress = AudioObjectPropertyAddress(
            mSelector: kAudioHardwarePropertyDevices,
            mScope: kAudioObjectPropertyScopeGlobal,
            mElement: kAudioObjectPropertyElementMain
        )
        var dataSize: UInt32 = 0
        guard AudioObjectGetPropertyDataSize(AudioObjectID(kAudioObjectSystemObject), &propAddress, 0, nil, &dataSize) == noErr else {
            return []
        }
        let deviceCount = Int(dataSize) / MemoryLayout<AudioDeviceID>.size
        var deviceIDs = [AudioDeviceID](repeating: 0, count: deviceCount)
        guard AudioObjectGetPropertyData(AudioObjectID(kAudioObjectSystemObject), &propAddress, 0, nil, &dataSize, &deviceIDs) == noErr else {
            return []
        }

        var result: [(id: AudioObjectID, name: String, uid: String)] = []
        for id in deviceIDs {
            guard isValidPhysicalOutputDevice(id) else { continue }
            let name = getDeviceName(id) ?? "Output Device \(id)"
            let uid = getDeviceUID(id) ?? ""
            result.append((id: id, name: name, uid: uid))
        }
        return result
    }

    private func queryBestDefaultOutputDevice() -> AudioObjectID {
        var propertyAddress = AudioObjectPropertyAddress(
            mSelector: kAudioHardwarePropertyDefaultOutputDevice,
            mScope: kAudioObjectPropertyScopeGlobal,
            mElement: kAudioObjectPropertyElementMain
        )
        var defaultID: AudioDeviceID = kAudioObjectUnknown
        var size = UInt32(MemoryLayout<AudioDeviceID>.size)
        if AudioObjectGetPropertyData(AudioObjectID(kAudioObjectSystemObject), &propertyAddress, 0, nil, &size, &defaultID) == noErr,
           isValidPhysicalOutputDevice(defaultID) {
            return defaultID
        }

        // Fallback: if macOS default output is pointed at a virtual driver, prefer External Headphones / external device over Built-in Speakers
        let allPhysical = getAllPhysicalOutputDevices()
        if let external = allPhysical.first(where: { !$0.uid.contains("BuiltInSpeakerDevice") }) {
            return external.id
        }
        return allPhysical.first?.id ?? kAudioObjectUnknown
    }

    private func findDefaultOutputDevice() {
        let best = queryBestDefaultOutputDevice()
        if best != kAudioObjectUnknown {
            self.outputDeviceID = best
        }
        querySampleRate(for: self.outputDeviceID)
    }

    private func querySampleRate(for deviceID: AudioObjectID) {
        var srAddress = AudioObjectPropertyAddress(
            mSelector: kAudioDevicePropertyNominalSampleRate,
            mScope: kAudioObjectPropertyScopeGlobal,
            mElement: kAudioObjectPropertyElementMain
        )
        var nominalSR: Float64 = 48000.0
        var srSize = UInt32(MemoryLayout<Float64>.size)
        if AudioObjectGetPropertyData(deviceID, &srAddress, 0, nil, &srSize, &nominalSR) == noErr && nominalSR > 0 {
            self.sampleRate = nominalSR
        }
    }

    private func getDeviceHardwareVolume(_ deviceID: AudioObjectID) -> Double? {
        guard deviceID != kAudioObjectUnknown else { return nil }

        var muteAddr = AudioObjectPropertyAddress(
            mSelector: kAudioDevicePropertyMute,
            mScope: kAudioObjectPropertyScopeOutput,
            mElement: kAudioObjectPropertyElementMain
        )
        var isMuted: UInt32 = 0
        var muteSize = UInt32(MemoryLayout<UInt32>.size)
        if AudioObjectHasProperty(deviceID, &muteAddr),
           AudioObjectGetPropertyData(deviceID, &muteAddr, 0, nil, &muteSize, &isMuted) == noErr,
           isMuted != 0 {
            return 0.0
        }

        var volAddr = AudioObjectPropertyAddress(
            mSelector: kAudioDevicePropertyVolumeScalar,
            mScope: kAudioObjectPropertyScopeOutput,
            mElement: kAudioObjectPropertyElementMain
        )
        var vol: Float32 = 1.0
        var volSize = UInt32(MemoryLayout<Float32>.size)
        if AudioObjectHasProperty(deviceID, &volAddr),
           AudioObjectGetPropertyData(deviceID, &volAddr, 0, nil, &volSize, &vol) == noErr {
            return Double(max(0.0, min(1.0, vol)))
        }

        // Fallback for multi-channel devices where volume is on elements 1 & 2
        var ch1Addr = AudioObjectPropertyAddress(
            mSelector: kAudioDevicePropertyVolumeScalar,
            mScope: kAudioObjectPropertyScopeOutput,
            mElement: 1
        )
        var ch2Addr = AudioObjectPropertyAddress(
            mSelector: kAudioDevicePropertyVolumeScalar,
            mScope: kAudioObjectPropertyScopeOutput,
            mElement: 2
        )
        var v1: Float32 = 1.0
        var v2: Float32 = 1.0
        var s1 = UInt32(MemoryLayout<Float32>.size)
        var s2 = UInt32(MemoryLayout<Float32>.size)
        if AudioObjectHasProperty(deviceID, &ch1Addr),
           AudioObjectGetPropertyData(deviceID, &ch1Addr, 0, nil, &s1, &v1) == noErr {
            if AudioObjectHasProperty(deviceID, &ch2Addr),
               AudioObjectGetPropertyData(deviceID, &ch2Addr, 0, nil, &s2, &v2) == noErr {
                return Double(max(0.0, min(1.0, (v1 + v2) * 0.5)))
            }
            return Double(max(0.0, min(1.0, v1)))
        }

        return nil
    }

    private func setDeviceHardwareVolume(_ deviceID: AudioObjectID, scalar: Float32) -> Bool {
        guard deviceID != kAudioObjectUnknown else { return false }
        var clamped = max(Float32(0.0), min(Float32(1.0), scalar))
        let floatSize = UInt32(MemoryLayout<Float32>.size)
        var applied = false

        var muteAddr = AudioObjectPropertyAddress(
            mSelector: kAudioDevicePropertyMute,
            mScope: kAudioObjectPropertyScopeOutput,
            mElement: kAudioObjectPropertyElementMain
        )
        var muteSettable: DarwinBoolean = false
        if AudioObjectHasProperty(deviceID, &muteAddr),
           AudioObjectIsPropertySettable(deviceID, &muteAddr, &muteSettable) == noErr,
           muteSettable.boolValue {
            var muteVal: UInt32 = clamped <= 0.001 ? 1 : 0
            AudioObjectSetPropertyData(deviceID, &muteAddr, 0, nil, UInt32(MemoryLayout<UInt32>.size), &muteVal)
        }

        for elem: UInt32 in [kAudioObjectPropertyElementMain, 1, 2] {
            var volAddr = AudioObjectPropertyAddress(
                mSelector: kAudioDevicePropertyVolumeScalar,
                mScope: kAudioObjectPropertyScopeOutput,
                mElement: elem
            )
            var settable: DarwinBoolean = false
            if AudioObjectHasProperty(deviceID, &volAddr),
               AudioObjectIsPropertySettable(deviceID, &volAddr, &settable) == noErr,
               settable.boolValue {
                if AudioObjectSetPropertyData(deviceID, &volAddr, 0, nil, floatSize, &clamped) == noErr {
                    applied = true
                }
            }
        }
        return applied
    }

    func emitOutputDevicesJSON() {
        let physicalDevices = getAllPhysicalOutputDevices()
        var entries: [String] = []
        for dev in physicalDevices {
            let escapedName = dev.name
                .replacingOccurrences(of: "\\", with: "\\\\")
                .replacingOccurrences(of: "\"", with: "\\\"")
            entries.append("{\"id\":\(dev.id),\"name\":\"\(escapedName)\"}")
        }

        let effectiveVol: Double
        if let hwVol = getDeviceHardwareVolume(outputDeviceID) {
            effectiveVol = (targetMasterVolume > 1.001 && hwVol >= 0.99) ? targetMasterVolume : hwVol
        } else {
            effectiveVol = targetMasterVolume
        }
        let roundedVol = (effectiveVol * 100.0).rounded() / 100.0

        let json = "{\"type\":\"devices\",\"activeDeviceId\":\(outputDeviceID),\"sampleRate\":\(Int(sampleRate)),\"volume\":\(roundedVol),\"devices\":[\(entries.joined(separator: ","))]}"
        print(json)
        fflush(stdout)
    }

    @inline(__always)
    private func processStereoFrameLocked(
        inL: Float,
        inR: Float,
        coeffSmooth: Double,
        limiterReleaseCoeff: Double
    ) -> (Float, Float) {
        var dL = Double(inL)
        var dR = Double(inR)

        // Smooth preamp & master volume
        currentPreampGain += (targetPreampGain - currentPreampGain) * coeffSmooth
        currentMasterVolume += (targetMasterVolume - currentMasterVolume) * coeffSmooth

        if !isBypassed {
            dL *= currentPreampGain
            dR *= currentPreampGain

            for b in 0..<activeBandCount {
                let c = bandCoeffs[b]
                if c.applyL {
                    dL = statesL[b].process(sample: dL, target: c, smooth: coeffSmooth)
                }
                if c.applyR {
                    dR = statesR[b].process(sample: dR, target: c, smooth: coeffSmooth)
                }
            }
        }

        dL *= currentMasterVolume
        dR *= currentMasterVolume

        // Per-sample transparent soft-knee saturation above 0.95 (prevents digital wrap-around without broadband volume ducking)
        @inline(__always)
        func softClip(_ x: Double) -> Double {
            let ax = abs(x)
            if ax <= 0.95 { return x }
            let sign = x >= 0.0 ? 1.0 : -1.0
            return sign * (0.95 + 0.05 * tanh((ax - 0.95) / 0.05))
        }

        let outL = Float(softClip(dL))
        let outR = Float(softClip(dR))

        let absL = abs(outL)
        let absR = abs(outR)
        if absL > peakL { peakL = absL }
        if absR > peakR { peakR = absR }
        sumSquaresL += outL * outL
        sumSquaresR += outR * outR
        sampleCount += 1

        fftInputBuffer[fftWriteHead] = (outL + outR) * 0.5
        fftWriteHead = (fftWriteHead + 1) % fftSize

        return (outL, outR)
    }

    // Single Synchronous Real-Time IOProc: reads Process Tap from inInputData, writes EQ audio to outOutputData
    private func handleSynchronousAudioIO(
        inInputData: UnsafePointer<AudioBufferList>,
        outOutputData: UnsafeMutablePointer<AudioBufferList>
    ) {
        let inABL = UnsafeMutableAudioBufferListPointer(UnsafeMutablePointer(mutating: inInputData))
        let outABL = UnsafeMutableAudioBufferListPointer(outOutputData)
        guard inABL.count > 0 && outABL.count > 0 else { return }

        // The Process Tap buffer is added via TapList (last input buffer if device also has mic inputs)
        let tapBuf = inABL[inABL.count - 1]
        guard let inData = tapBuf.mData else { return }
        let inPtr = inData.assumingMemoryBound(to: Float.self)
        let inChannels = max(1, Int(tapBuf.mNumberChannels))
        let inTotalFloats = Int(tapBuf.mDataByteSize) / MemoryLayout<Float>.size
        let inFrames = inTotalFloats / inChannels

        os_unfair_lock_lock(lock)
        let coeffSmooth = 0.005 // ~4ms smooth parameter transition
        let limiterReleaseCoeff = exp(-1.0 / (0.080 * sampleRate))

        if outABL.count >= 2 && outABL[0].mNumberChannels == 1 {
            // Non-interleaved output buffers (Buffer 0 = Left, Buffer 1 = Right)
            guard let outDataL = outABL[0].mData, let outDataR = outABL[1].mData else {
                os_unfair_lock_unlock(lock)
                return
            }
            let outPtrL = outDataL.assumingMemoryBound(to: Float.self)
            let outPtrR = outDataR.assumingMemoryBound(to: Float.self)
            let outFrames = Int(outABL[0].mDataByteSize) / MemoryLayout<Float>.size
            let frames = min(inFrames, outFrames)

            for f in 0..<frames {
                let sL = inPtr[f * inChannels]
                let sR = inChannels >= 2 ? inPtr[f * inChannels + 1] : sL
                let (oL, oR) = processStereoFrameLocked(
                    inL: sL,
                    inR: sR,
                    coeffSmooth: coeffSmooth,
                    limiterReleaseCoeff: limiterReleaseCoeff
                )
                outPtrL[f] = oL
                outPtrR[f] = oR
            }
        } else {
            // Interleaved output buffer (Buffer 0 = Stereo L, R, ...)
            let outBuf = outABL[0]
            guard let outData = outBuf.mData else {
                os_unfair_lock_unlock(lock)
                return
            }
            let outPtr = outData.assumingMemoryBound(to: Float.self)
            let outChannels = max(1, Int(outBuf.mNumberChannels))
            let outTotalFloats = Int(outBuf.mDataByteSize) / MemoryLayout<Float>.size
            let outFrames = outTotalFloats / outChannels
            let frames = min(inFrames, outFrames)

            for f in 0..<frames {
                let sL = inPtr[f * inChannels]
                let sR = inChannels >= 2 ? inPtr[f * inChannels + 1] : sL
                let (oL, oR) = processStereoFrameLocked(
                    inL: sL,
                    inR: sR,
                    coeffSmooth: coeffSmooth,
                    limiterReleaseCoeff: limiterReleaseCoeff
                )
                if outChannels >= 2 {
                    outPtr[f * outChannels] = oL
                    outPtr[f * outChannels + 1] = oR
                    for ch in 2..<outChannels {
                        outPtr[f * outChannels + ch] = 0.0
                    }
                } else {
                    outPtr[f] = (oL + oR) * 0.5
                }
            }
        }
        os_unfair_lock_unlock(lock)
    }

    private func recomputeAllBandsLocked(snapStates: Bool = false) {
        for i in 0..<maxBands {
            bandCoeffs[i] = BiquadCoefficients(applyL: false, applyR: false)
        }
        var maxIdx = 0
        for band in cachedBands {
            guard band.index >= 0 && band.index < maxBands else { continue }
            let coeffs = computeCoefficients(band: band, sampleRate: sampleRate)
            bandCoeffs[band.index] = coeffs
            if snapStates {
                statesL[band.index].snapTo(coeffs)
                statesR[band.index].snapTo(coeffs)
            }
            if band.index + 1 > maxIdx {
                maxIdx = band.index + 1
            }
        }
        activeBandCount = maxIdx
    }

    // Update bands and optional preamp from UI
    func updateBands(_ bands: [BandConfig], preampDb: Double?) {
        os_unfair_lock_lock(lock)
        if let db = preampDb {
            let clamped = max(-24.0, min(24.0, db))
            self.targetPreampGain = pow(10.0, clamped / 20.0)
        }
        let countChanged = bands.count != self.cachedBands.count
        self.cachedBands = bands
        recomputeAllBandsLocked(snapStates: countChanged)
        os_unfair_lock_unlock(lock)
    }

    func setBypass(_ bypass: Bool) {
        os_unfair_lock_lock(lock)
        self.isBypassed = bypass
        os_unfair_lock_unlock(lock)
    }

    func setVolume(_ volume: Double) {
        let clamped = max(0.0, min(2.0, volume))
        lastVolumeSetTimestamp = ProcessInfo.processInfo.systemUptime
        let hwScalar = Float32(min(1.0, max(0.0, clamped)))
        let hwApplied = setDeviceHardwareVolume(outputDeviceID, scalar: hwScalar)

        os_unfair_lock_lock(lock)
        if hwApplied {
            // Hardware handles 0%..100% on the Mac directly; DSP only boosts above 100%
            self.targetMasterVolume = clamped > 1.0 ? clamped : 1.0
        } else {
            self.targetMasterVolume = clamped
        }
        os_unfair_lock_unlock(lock)
    }

    // Generate telemetry (peak, rms, 64-bin logarithmic FFT) with zero heap allocations inside the lock
    func generateTelemetry() -> String? {
        os_unfair_lock_lock(lock)
        guard sampleCount > 0 else {
            os_unfair_lock_unlock(lock)
            return nil
        }

        let pL = peakL
        let pR = peakR
        let rmsL = sqrt(sumSquaresL / Float(sampleCount))
        let rmsR = sqrt(sumSquaresR / Float(sampleCount))
        let currentSR = sampleRate

        peakL *= 0.82
        peakR *= 0.82
        sumSquaresL = 0
        sumSquaresR = 0
        sampleCount = 0

        // Copy circular FFT buffer into pre-allocated snapshot buffer under lock (no heap allocations)
        for i in 0..<fftSize {
            let idx = (fftWriteHead + i) % fftSize
            fftSnapshotBuffer[i] = fftInputBuffer[idx]
        }
        os_unfair_lock_unlock(lock)

        // All FFT math runs outside the lock
        guard let setup = fftSetup else { return nil }
        vDSP_vmul(fftSnapshotBuffer, 1, fftWindow, 1, &fftWindowedBuffer, 1, vDSP_Length(fftSize))

        let halfN = fftSize / 2

        fftWindowedBuffer.withUnsafeBufferPointer { inPtr in
            inPtr.baseAddress!.withMemoryRebound(to: DSPComplex.self, capacity: halfN) { complexPtr in
                fftRealBuffer.withUnsafeMutableBufferPointer { realBuf in
                    fftImagBuffer.withUnsafeMutableBufferPointer { imagBuf in
                        var splitComplex = DSPSplitComplex(realp: realBuf.baseAddress!, imagp: imagBuf.baseAddress!)
                        vDSP_ctoz(complexPtr, 2, &splitComplex, 1, vDSP_Length(halfN))
                        vDSP_fft_zrip(setup, &splitComplex, 1, log2n, FFTDirection(FFT_FORWARD))
                        splitComplex.imagp[0] = 0
                        fftMagBuffer.withUnsafeMutableBufferPointer { magBuf in
                            vDSP_zvabs(&splitComplex, 1, magBuf.baseAddress!, 1, vDSP_Length(halfN))
                        }
                    }
                }
            }
        }

        let numBins = 64
        var bins = [Float](repeating: 0.0, count: numBins)
        let normFactor = 1.0 / (Float(fftSize) * 0.25)

        for b in 0..<numBins {
            let f0 = 20.0 * pow(1000.0, Double(b) / Double(numBins))
            let f1 = 20.0 * pow(1000.0, Double(b + 1) / Double(numBins))
            let k0 = max(1.0, min(Double(halfN - 1), f0 * Double(fftSize) / currentSR))
            let k1 = max(k0, min(Double(halfN - 1), f1 * Double(fftSize) / currentSR))

            var mag: Float = 0.0
            if k1 - k0 < 1.0 {
                let kCenter = 0.5 * (k0 + k1)
                let idx0 = max(1, min(halfN - 2, Int(floor(kCenter))))
                let frac = Float(kCenter - Double(idx0))
                mag = fftMagBuffer[idx0] * (1.0 - frac) + fftMagBuffer[idx0 + 1] * frac
            } else {
                let startIdx = max(1, min(halfN - 1, Int(floor(k0))))
                let endIdx = max(startIdx + 1, min(halfN, Int(ceil(k1))))
                var sum: Float = 0.0
                for idx in startIdx..<endIdx {
                    if fftMagBuffer[idx] > sum {
                        sum = fftMagBuffer[idx]
                    }
                }
                mag = sum
            }

            let scaledMag = mag * normFactor
            let db = 20.0 * log10(max(1e-5, scaledMag))
            let normalized = max(0.0, min(1.0, (db + 65.0) / 65.0))
            bins[b] = Float((Double(normalized) * 1000.0).rounded() / 1000.0)
        }

        let roundedPeakL = (Double(pL) * 1000.0).rounded() / 1000.0
        let roundedPeakR = (Double(pR) * 1000.0).rounded() / 1000.0
        let roundedRmsL = (Double(rmsL) * 1000.0).rounded() / 1000.0
        let roundedRmsR = (Double(rmsR) * 1000.0).rounded() / 1000.0

        let binsString = bins.map { String(format: "%.3f", $0) }.joined(separator: ",")
        return "{\"type\":\"telemetry\",\"peakL\":\(roundedPeakL),\"peakR\":\(roundedPeakR),\"rmsL\":\(roundedRmsL),\"rmsR\":\(roundedRmsR),\"fft\":[\(binsString)]}"
    }
}

// MARK: - Process Entry Point
let engine = NativeAudioEngine()
guard engine.start() else {
    fputs("ERROR: Failed to start Native Audio Engine\n", stderr)
    exit(1)
}

// Telemetry timer at ~60Hz
let telemetryTimer = DispatchSource.makeTimerSource(queue: DispatchQueue.global(qos: .userInteractive))
telemetryTimer.schedule(deadline: .now(), repeating: .milliseconds(16))
telemetryTimer.setEventHandler {
    if let json = engine.generateTelemetry() {
        print(json)
        fflush(stdout)
    }
}
telemetryTimer.resume()

// Handle termination signals via async-safe DispatchSource
signal(SIGINT, SIG_IGN)
signal(SIGTERM, SIG_IGN)

let sigintSource = DispatchSource.makeSignalSource(signal: SIGINT, queue: .main)
sigintSource.setEventHandler {
    telemetryTimer.cancel()
    engine.stop()
    exit(0)
}
sigintSource.resume()

let sigtermSource = DispatchSource.makeSignalSource(signal: SIGTERM, queue: .main)
sigtermSource.setEventHandler {
    telemetryTimer.cancel()
    engine.stop()
    exit(0)
}
sigtermSource.resume()

// Stdin Command Loop
let decoder = JSONDecoder()

while let line = readLine() {
    guard let data = line.data(using: .utf8) else { continue }
    if let cmd = try? decoder.decode(CommandPayload.self, from: data) {
        switch cmd.type {
        case "updateBands":
            if let bands = cmd.bands {
                engine.updateBands(bands, preampDb: cmd.preamp)
            }
        case "setBypass":
            if let bypass = cmd.bypass {
                engine.setBypass(bypass)
            }
        case "setVolume":
            if let vol = cmd.volume {
                engine.setVolume(vol)
            }
        case "setOutputDevice":
            if let devId = cmd.deviceId {
                engine.switchOutputDevice(AudioObjectID(devId))
            }
        case "getDevices":
            engine.emitOutputDevicesJSON()
        case "quit":
            telemetryTimer.cancel()
            engine.stop()
            exit(0)
        default:
            break
        }
    }
}

telemetryTimer.cancel()
engine.stop()
