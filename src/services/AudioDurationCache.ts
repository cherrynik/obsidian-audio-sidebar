import type { App, TFile } from 'obsidian';

export class AudioDurationCache {
  private readonly values = new Map<string, number | null>();
  private readonly pending = new Map<string, Promise<number | null>>();
  private readonly queue: Array<{ file: TFile; resolve: (duration: number | null) => void }> = [];
  private activeRequests = 0;

  constructor(private readonly app: App, private readonly maximumConcurrentRequests = 2) {}

  get(path: string): number | null { return this.values.get(path) ?? null; }
  has(path: string): boolean { return this.values.has(path); }

  load(file: TFile): Promise<number | null> {
    if (this.values.has(file.path)) return Promise.resolve(this.get(file.path));
    const existing = this.pending.get(file.path);
    if (existing) return existing;

    const request = new Promise<number | null>(resolve => {
      this.queue.push({ file, resolve });
      this.drain();
    }).then(duration => {
      this.values.set(file.path, duration);
      return duration;
    }).finally(() => this.pending.delete(file.path));
    this.pending.set(file.path, request);
    return request;
  }

  rename(oldPath: string, newPath: string): void {
    if (!this.values.has(oldPath)) return;
    const duration = this.values.get(oldPath) ?? null;
    this.values.delete(oldPath);
    this.values.set(newPath, duration);
  }

  private drain(): void {
    while (this.activeRequests < this.maximumConcurrentRequests && this.queue.length) {
      const job = this.queue.shift();
      if (!job) return;
      this.activeRequests += 1;
      const probe = document.createElement('audio');
      let finished = false;
      const finish = (duration: number | null): void => {
        if (finished) return;
        finished = true;
        probe.removeAttribute('src');
        probe.load();
        this.activeRequests -= 1;
        job.resolve(duration);
        this.drain();
      };
      probe.preload = 'metadata';
      probe.addEventListener('loadedmetadata', () => finish(Number.isFinite(probe.duration) ? probe.duration : null), { once: true });
      probe.addEventListener('error', () => finish(null), { once: true });
      probe.src = this.app.vault.getResourcePath(job.file);
    }
  }
}
