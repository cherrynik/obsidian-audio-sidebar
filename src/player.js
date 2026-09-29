class SingleAudioPlayer {
  constructor(app, onChange, onError, settings, createAudio = () => document.createElement('audio')) {
    this.app = app;
    this.onChange = onChange;
    this.onError = onError;
    this.volume = settings.volume;
    this.rate = settings.rate;
    this.repeatOne = false;
    this.queuePaths = [];
    this.queueName = '';
    this.file = null;
    this.createAudio = createAudio;
    this.resetAudio();
  }

  resetAudio() {
    this.audio = this.createAudio();
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
      if (this.repeatOne) {
        this.audio.currentTime = 0;
        this.resume();
      } else {
        this.playRelative(1);
      }
    });
  }

  get playing() { return !!this.file && !this.audio.paused; }
  get position() { return Number.isFinite(this.audio.currentTime) ? this.audio.currentTime : 0; }
  get duration() { return Number.isFinite(this.audio.duration) ? this.audio.duration : 0; }

  setVolume(value) {
    this.audio.volume = Math.max(0, Math.min(1, Number(value) || 0));
    this.volume = this.audio.volume;
  }

  setRate(value) {
    this.audio.playbackRate = Math.max(0.5, Math.min(2, Number(value) || 1));
    this.rate = this.audio.playbackRate;
  }

  setRepeatOne(enabled) {
    this.repeatOne = !!enabled;
    this.onChange();
  }

  play(file, queuePaths, queueName, startTime = 0) {
    if (!file) return;
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

  pause() { this.audio.pause(); }
  resume() { if (this.file) this.audio.play().catch(error => this.onError(error.message)); }
  toggle() { this.playing ? this.pause() : this.resume(); }
  seek(seconds) { this.audio.currentTime = Math.max(0, Math.min(this.duration, Number(seconds) || 0)); }

  playRelative(offset) {
    if (!this.file || !this.queuePaths.length) return;
    const index = this.queuePaths.indexOf(this.file.path);
    const nextIndex = (index + offset + this.queuePaths.length) % this.queuePaths.length;
    const file = this.app.vault.getAbstractFileByPath(this.queuePaths[nextIndex]);
    if (file) this.play(file, this.queuePaths, this.queueName);
  }

  stop() {
    this.audio.pause();
    this.audio.removeAttribute('src');
    this.audio.load();
    this.file = null;
    this.queuePaths = [];
    this.queueName = '';
    this.onChange();
  }
}

module.exports = { SingleAudioPlayer };
