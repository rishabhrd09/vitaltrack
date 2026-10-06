/** Serializes the native microphone, including cancellation DURING preparation/stop. */
type Recorder = {
  uri: string | null;
  prepareToRecordAsync(): Promise<unknown>;
  record(options: { forDuration: number }): void;
  stop(): Promise<void>;
};
export type CapturePhase = 'idle' | 'preparing' | 'recording' | 'stopping';
type Capture = { cancelled: boolean; prepared: boolean; uri: string | null };

export class MicrophoneCapture {
  private current: Capture | null = null;
  private state: CapturePhase = 'idle';
  constructor(
    private recorder: Recorder,
    private remember: (uri: string) => Promise<void>,
    private discard: (uri: string | null) => Promise<void>,
    private notify: (phase: CapturePhase) => void = () => {},
    private restoreAudioMode: () => Promise<void> = async () => {},
  ) {}
  get phase() { return this.state; }
  private phaseChanged(phase: CapturePhase) { this.state = phase; this.notify(phase); }
  private async release(capture: Capture) {
    // Do not let a late cleanup switch off recording mode for the next take.
    await this.restoreAudioMode().catch(() => {});
    if (this.current === capture) { this.current = null; this.phaseChanged('idle'); }
  }
  private async stop(capture: Capture) {
    if (capture.prepared) {
      this.phaseChanged('stopping');
      try { await this.recorder.stop(); }
      finally { capture.uri = this.recorder.uri || capture.uri; capture.prepared = false; }
    }
  }
  async start(preparePermissionAndMode: () => Promise<void>): Promise<boolean> {
    if (this.current) return false;
    const capture: Capture = { cancelled: false, prepared: false, uri: null };
    this.current = capture; this.phaseChanged('preparing');
    let started = false;
    try {
      await preparePermissionAndMode();
      if (capture.cancelled) return false;
      await this.recorder.prepareToRecordAsync();
      capture.prepared = true; capture.uri = this.recorder.uri;
      if (!capture.uri) throw new Error('Recording storage unavailable.');
      // Register even if cancelled: failed deletion can be retried on the next launch.
      await this.remember(capture.uri);
      if (capture.cancelled) return false;
      this.recorder.record({ forDuration: 28 });
      started = true; this.phaseChanged('recording');
      return true;
    } finally {
      if (!started) {
        try { await this.stop(capture); }
        finally { await this.discard(capture.uri).catch(() => {}); await this.release(capture); }
      }
    }
  }
  async finish(): Promise<string | null> {
    const capture = this.current;
    if (!capture || this.state !== 'recording') return null;
    // Set synchronously so Finish, the timeout and Cancel cannot stop the same take twice.
    this.phaseChanged('stopping');
    try {
      await this.stop(capture);
      if (capture.cancelled) { await this.discard(capture.uri); return null; }
      return capture.uri;
    } catch (error) {
      await this.discard(capture.uri).catch(() => {});
      throw error;
    } finally { await this.release(capture); }
  }
  cancel() {
    if (!this.current) return;
    this.current.cancelled = true;
    if (this.state === 'recording') void this.finish().catch(() => {});
    // Preparation and stop hold the lock until their own finally blocks have cleaned up.
  }
}

/** A level indicator, NOT speech recognition/VAD. Never rejects quiet speakers. */
export function microphoneLevel(db: number | undefined): { percent: number; message: string } {
  if (typeof db !== 'number' || !Number.isFinite(db)) return { percent: 0, message: 'Level unavailable — check the transcript after recording.' };
  return {
    percent: Math.round(Math.min(100, Math.max(0, (db + 60) / 60 * 100))),
    message: db < -50 ? 'Very quiet — check your microphone or move closer.' : db > -3 ? 'Very loud — move a little farther from the microphone.' : 'Sound detected — speak naturally, then tap Finish.',
  };
}
