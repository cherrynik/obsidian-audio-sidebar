import type { App, TFile } from 'obsidian';

export class SingleAudioPlayer {
  readonly audio: HTMLAudioElement;
  file: TFile | null = null;
  queuePaths: string[] = [];
  queueName = '';
  wantsPlayback = false;
  volume: number;
  rate: number;

  constructor(
    private readonly app: App,
    private readonly onChange: () => void,
    private readonly onError: (message: string) => void,
    settings: { volume: number; rate: number },
    createAudio: () => HTMLAudioElement = () => document.createElement('audio')
  ) {
    this.volume = settings.volume;
    this.rate = settings.rate;
    this.audio = createAudio();
    this.audio.preload = 'metadata';
    this.audio.volume = this.volume;
    this.audio.playbackRate = this.rate;
    for (const event of ['play', 'pause', 'loadedmetadata', 'volumechange', 'ratechange']) {
      this.audio.addEventListener(event, () => {
        this.volume = this.audio.volume;
        this.rate = this.audio.playbackRate;
        this.onChange();
      });
    }
    this.audio.addEventListener('error', () => this.onError(this.audio.error?.message || 'Unknown audio error'));
    this.audio.addEventListener('ended', () => {
      this.playRelative(1);
    });
  }

  get playing(): boolean { return !!this.file && !this.audio.paused; }
  get position(): number { return Number.isFinite(this.audio.currentTime) ? this.audio.currentTime : 0; }
  get duration(): number { return Number.isFinite(this.audio.duration) ? this.audio.duration : 0; }

  play(file: TFile, queuePaths: string[], queueName: string, startTime = 0): void {
    this.wantsPlayback = true;
    this.audio.pause();
    this.file = file;
    this.queuePaths = queuePaths.length ? [...queuePaths] : [file.path];
    this.queueName = queueName || file.parent?.name || 'Audio';
    this.audio.src = this.app.vault.getResourcePath(file);
    this.audio.load();
    if (startTime > 0) {
      this.audio.addEventListener('loadedmetadata', () => {
        if (this.file === file) this.audio.currentTime = Math.min(startTime, Math.max(0, this.duration - 0.05));
      }, { once: true });
    }
    this.resume();
    this.onChange();
  }

  pause(): void { this.wantsPlayback = false; this.audio.pause(); }
  resume(): void {
    if (!this.file) return;
    this.wantsPlayback = true;
    void this.audio.play().catch(error => { this.wantsPlayback = false; this.onError(error.message); });
  }
  toggle(): void { this.playing ? this.pause() : this.resume(); }
  playRelative(offset: number): void {
    if (!this.file || !this.queuePaths.length) return;
    const index = this.queuePaths.indexOf(this.file.path);
    const nextIndex = (index + offset + this.queuePaths.length) % this.queuePaths.length;
    const file = this.app.vault.getAbstractFileByPath(this.queuePaths[nextIndex]);
    if (file && 'extension' in file) this.play(file as TFile, this.queuePaths, this.queueName);
  }
  stop(): void {
    this.wantsPlayback = false;
    this.audio.pause();
    this.audio.removeAttribute('src');
    this.audio.load();
    this.file = null;
    this.queuePaths = [];
    this.queueName = '';
    this.onChange();
  }
}
