const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { test } = require('node:test');
const vm = require('node:vm');

class FakeHowl {
  constructor(options) {
    this.options = options;
    this.listeners = new Map();
    this.isPlaying = false;
    this.level = options.volume;
    this.position = 0;
    this.unloaded = false;
  }
  once(name, callback) { this.listeners.set(name, callback); }
  off(name) { this.listeners.delete(name); }
  playing() { return this.isPlaying; }
  play() { this.isPlaying = true; return 7; }
  pause() { this.isPlaying = false; }
  stop() { this.isPlaying = false; this.position = 0; }
  unload() { this.unloaded = true; }
  seek(value) {
    if (typeof value === 'number' && value !== 7) this.position = value;
    return this.position;
  }
  volume(value) {
    if (typeof value === 'number' && value !== 7) this.level = value;
    return this.level;
  }
  fade(_from, to) {
    this.level = to;
    this.listeners.get('fade')?.();
  }
}

const moduleContext = { exports: {} };
vm.runInNewContext(readFileSync('src/audio-clip.js', 'utf8'), {
  module: moduleContext,
  require: name => {
    assert.equal(name, 'howler');
    return { Howl: FakeHowl };
  }
});
const { AudioClip } = moduleContext.exports;

test('effects play, pause, resume, fade and release their audio resource', async () => {
  const clip = new AudioClip('app://local/effect.mp3', { volume: 0.4, dataset: { sfxName: 'Effect' } });
  assert.equal(clip._howl.options.html5, true);
  assert.equal(clip._howl.options.preload, 'metadata');
  await clip.play();
  assert.equal(clip.paused, false);
  clip.currentTime = 12;
  assert.equal(clip.currentTime, 12);
  clip.pause();
  assert.equal(clip.paused, true);
  await clip.play();
  await clip.fadeTo(0.1, 300);
  assert.equal(clip.volume, 0.1);
  clip.stop();
  clip.unload();
  assert.equal(clip._howl.unloaded, true);
});

test('completion marks a one-shot clip ended and calls its cleanup', async () => {
  let ended = 0;
  const clip = new AudioClip('app://local/effect.mp3', { onEnd: () => ended++ });
  await clip.play();
  clip._howl.options.onend();
  assert.equal(clip.ended, true);
  assert.equal(ended, 1);
});

test('an ambient loop keeps playing and can fade out without ending the clip', async () => {
  let ended = 0;
  const clip = new AudioClip('app://local/ambient.mp3', {
    loop: true,
    volume: 0,
    onEnd: () => ended++
  });
  await clip.play();
  await clip.fadeTo(0.6, 300);
  assert.equal(clip.volume, 0.6);
  clip._howl.options.onend();
  assert.equal(clip.ended, false);
  assert.equal(ended, 0);
  await clip.fadeTo(0, 300);
  clip.stop();
  assert.equal(clip.paused, true);
});
