/**
 * Audio Source Capture Manager.
 * Handles system audio output loopback (via desktopCapturer) and physical audio input devices.
 */

export interface AudioDeviceOption {
  readonly deviceId: string;
  readonly label: string;
}

export class AudioSourceManager {
  private readonly ctx: AudioContext;
  private currentStream: MediaStream | null = null;
  private currentSourceNode: MediaStreamAudioSourceNode | null = null;

  constructor(ctx: AudioContext) {
    this.ctx = ctx;
  }

  public get sourceNode(): MediaStreamAudioSourceNode | null {
    return this.currentSourceNode;
  }

  /**
   * Captures system audio from a desktopCapturer source ID or ScreenCaptureKit.
   * Falls back to default input capture if desktop loopback is unpermitted.
   */
  public async captureDesktopAudio(sourceId?: string): Promise<MediaStreamAudioSourceNode> {
    this.stopCurrentStream();

    let stream: MediaStream | null = null;

    // 1. Try getDisplayMedia with system audio (supported on macOS 13+ ScreenCaptureKit)
    if (navigator.mediaDevices.getDisplayMedia) {
      try {
        stream = await navigator.mediaDevices.getDisplayMedia({
          audio: true,
          video: { width: 1, height: 1, frameRate: 1 },
        });
      } catch {
        // Fall back to desktopCapturer constraints
      }
    }

    // 2. Try desktopCapturer constraints if sourceId provided
    if (!stream && sourceId) {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            mandatory: {
              chromeMediaSource: 'desktop',
              chromeMediaSourceId: sourceId,
            },
          } as unknown as MediaTrackConstraints,
          video: {
            mandatory: {
              chromeMediaSource: 'desktop',
              chromeMediaSourceId: sourceId,
              maxWidth: 1,
              maxHeight: 1,
            },
          } as unknown as MediaTrackConstraints,
        });
      } catch {
        // Fall back to default input capture
      }
    }

    // 3. Fallback to default audio input (microphone or loopback device like BlackHole)
    if (!stream) {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      });
    }

    // Disable video track so it consumes no CPU/GPU
    for (const track of stream.getVideoTracks()) {
      track.enabled = false;
    }

    this.currentStream = stream;
    this.currentSourceNode = this.ctx.createMediaStreamSource(stream);
    return this.currentSourceNode;
  }

  /**
   * Captures audio from an input device (microphone or loopback device like BlackHole).
   */
  public async captureInputDevice(deviceId: string): Promise<MediaStreamAudioSourceNode> {
    this.stopCurrentStream();

    const audioConstraints: MediaTrackConstraints = {
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
    };
    if (deviceId) {
      audioConstraints.deviceId = { exact: deviceId };
    }

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: audioConstraints,
    });

    this.currentStream = stream;
    this.currentSourceNode = this.ctx.createMediaStreamSource(stream);
    return this.currentSourceNode;
  }

  public async getAvailableInputDevices(): Promise<readonly AudioDeviceOption[]> {
    if (!navigator.mediaDevices?.enumerateDevices) {
      return [];
    }
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices
      .filter((d) => d.kind === 'audioinput')
      .map((d, index) => ({
        deviceId: d.deviceId,
        label: d.label || `Audio Input ${index + 1}`,
      }));
  }

  public stopCurrentStream(): void {
    if (this.currentStream) {
      for (const track of this.currentStream.getTracks()) {
        track.stop();
      }
      this.currentStream = null;
    }
    if (this.currentSourceNode) {
      try {
        this.currentSourceNode.disconnect();
      } catch {
        // Disconnect safely
      }
      this.currentSourceNode = null;
    }
  }
}
