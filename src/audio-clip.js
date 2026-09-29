const { Howl } = require('howler');

// Small effects and ambient loops share one playback API. Music tracks keep
// their HTMLAudioElements so large files can stream without full decoding.
class AudioClip {
  constructor(source, { loop = false, volume = 1, dataset = {}, onEnd = () => {} } = {}) {
    this.dataset = dataset;
    this._ended = false;
    this._soundId = null;
    this._howl = new Howl({
      src: [source],
      html5: true,
      preload: 'metadata',
      loop,
      volume,
      onend: () => {
        if (loop) return;
        this._ended = true;
        onEnd();
      }
    });
  }

  get paused() { return !this._howl.playing(this._soundId); }
  get ended() { return this._ended; }
  get currentTime() {
    const position = this._howl.seek(this._soundId);
    return typeof position === 'number' && Number.isFinite(position) ? position : 0;
  }
  set currentTime(value) { this._howl.seek(value, this._soundId); }
  get volume() { return this._howl.volume(this._soundId); }
  set volume(value) { this._howl.volume(value, this._soundId); }

  play() {
    if (!this.paused) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const soundId = this._soundId == null ? this._howl.play() : this._howl.play(this._soundId);
      if (soundId == null) {
        reject(new Error('Audio playback could not start'));
        return;
      }
      this._soundId = soundId;
      this._ended = false;
      const cleanup = () => {
        this._howl.off('play', onPlay, soundId);
        this._howl.off('playerror', onError, soundId);
        this._howl.off('loaderror', onError);
      };
      const onPlay = () => { cleanup(); resolve(); };
      const onError = (_id, error) => {
        cleanup();
        reject(error instanceof Error ? error : new Error(String(error || 'Audio playback failed')));
      };
      this._howl.once('play', onPlay, soundId);
      this._howl.once('playerror', onError, soundId);
      this._howl.once('loaderror', onError);
      if (this._howl.playing(soundId)) onPlay();
    });
  }

  pause() { this._howl.pause(this._soundId); }
  stop() { this._howl.stop(this._soundId); this._ended = false; }
  unload() { this._howl.unload(); }

  fadeTo(volume, durationMs) {
    if (durationMs <= 0 || Math.abs(this.volume - volume) < 0.01) {
      this.volume = volume;
      return Promise.resolve();
    }
    return new Promise(resolve => {
      const soundId = this._soundId;
      this._howl.once('fade', resolve, soundId);
      this._howl.fade(this.volume, volume, durationMs, soundId);
    });
  }
}

module.exports = { AudioClip };
