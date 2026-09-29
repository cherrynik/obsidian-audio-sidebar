const { Howl } = require('howler');

class SingleAudioPlayer {
  constructor(app, onChange, onError, settings) {
    this.app = app;
    this.onChange = onChange;
    this.onError = onError;
    this.volume = settings.volume;
    this.rate = settings.rate;
    this.repeatOne = false;
    this.queuePaths = [];
    this.queueName = '';
    this.file = null;
    this.sound = null;
  }

  get playing() { return !!this.sound?.playing(); }
  get position() {
    const value = this.sound?.seek();
    return typeof value === 'number' && Number.isFinite(value) ? value : 0;
  }
  get duration() {
    const value = this.sound?.duration();
    return Number.isFinite(value) ? value : 0;
  }

  setVolume(value) {
    this.volume = Math.max(0, Math.min(1, Number(value) || 0));
    this.sound?.volume(this.volume);
    this.onChange();
  }

  setRate(value) {
    this.rate = Math.max(0.5, Math.min(2, Number(value) || 1));
    this.sound?.rate(this.rate);
    this.onChange();
  }

  setRepeatOne(enabled) {
    this.repeatOne = !!enabled;
    this.onChange();
  }

  play(file, queuePaths, queueName, startTime = 0) {
    if (!file) return;
    // Dispose first: even a paused previous track must release its audio node.
    this.sound?.stop();
    this.sound?.unload();
    this.file = file;
    this.queuePaths = queuePaths.length ? [...queuePaths] : [file.path];
    this.queueName = queueName || file.parent?.name || 'Audio';
    const sound = new Howl({
      src: [this.app.vault.getResourcePath(file)],
      format: [file.extension.toLowerCase()],
      html5: true,
      preload: 'metadata',
      volume: this.volume,
      rate: this.rate,
      onplay: () => {
        if (this.sound !== sound) return;
        if (startTime > 0) {
          sound.seek(Math.min(startTime, Math.max(0, this.duration - 0.05)));
          startTime = 0;
        }
        this.onChange();
      },
      onpause: () => { if (this.sound === sound) this.onChange(); },
      onload: () => { if (this.sound === sound) this.onChange(); },
      onend: () => {
        if (this.sound !== sound) return;
        if (this.repeatOne) {
          sound.seek(0);
          sound.play();
        } else {
          this.playRelative(1);
        }
      },
      onloaderror: (_id, error) => { if (this.sound === sound) this.onError(error); },
      onplayerror: (_id, error) => { if (this.sound === sound) this.onError(error); }
    });
    this.sound = sound;
    sound.play();
    this.onChange();
  }

  pause() { this.sound?.pause(); }
  resume() { this.sound?.play(); }
  toggle() { this.playing ? this.pause() : this.resume(); }
  seek(seconds) {
    if (!this.sound) return;
    this.sound.seek(Math.max(0, Math.min(this.duration, Number(seconds) || 0)));
    this.onChange();
  }

  playRelative(offset) {
    if (!this.file || !this.queuePaths.length) return;
    const index = this.queuePaths.indexOf(this.file.path);
    const nextIndex = (index + offset + this.queuePaths.length) % this.queuePaths.length;
    const path = this.queuePaths[nextIndex];
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!file) return;
    this.play(file, this.queuePaths, this.queueName);
  }

  stop() {
    const sound = this.sound;
    this.sound = null;
    this.file = null;
    this.queuePaths = [];
    this.queueName = '';
    sound?.stop();
    sound?.unload();
    this.onChange();
  }
}

module.exports = { SingleAudioPlayer };
