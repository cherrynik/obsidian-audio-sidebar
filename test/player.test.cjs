const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { test } = require('node:test');
const vm = require('node:vm');
const { transformSync } = require('esbuild');

class FakeAudio {
  constructor() {
    this.listeners = new Map();
    this.paused = true;
    this.currentTime = 0;
    this.duration = 180;
    this.volume = 1;
    this.playbackRate = 1;
    this.attributes = {};
    this.src = '';
  }
  addEventListener(name, listener) {
    const entries = this.listeners.get(name) || [];
    entries.push(listener);
    this.listeners.set(name, entries);
  }
  dispatch(name) { for (const listener of this.listeners.get(name) || []) listener(); }
  play() { this.paused = false; this.dispatch('play'); return Promise.resolve(); }
  pause() { this.paused = true; this.dispatch('pause'); }
  load() { this.currentTime = 0; }
  removeAttribute(name) { this[name] = ''; }
}

const loaded = { exports: {} };
const compiled = transformSync(readFileSync('src/player.ts', 'utf8'), { loader: 'ts', format: 'cjs' }).code;
vm.runInNewContext(compiled, { module: loaded, exports: loaded.exports });
const { SingleAudioPlayer } = loaded.exports;
const files = ['Audio/one.mp3', 'Audio/two.mp3'].map(path => ({
  path, basename: path.split('/').pop(), extension: 'mp3', parent: { name: 'Audio' }
}));
const app = { vault: {
  getResourcePath: file => `app://local/${file.path}`,
  getAbstractFileByPath: path => files.find(file => file.path === path)
} };
const createPlayer = () => {
  const audio = new FakeAudio();
  return { player: new SingleAudioPlayer(app, () => {}, () => {}, { volume: 0.8, rate: 1.25 }, () => audio), audio };
};

test('one persistent audio element changes source and preserves folder queue', () => {
  const { player, audio } = createPlayer();
  player.play(files[0], files.map(file => file.path), 'Audio');
  const firstSource = audio.src;
  player.playRelative(1);
  assert.notEqual(audio.src, firstSource);
  assert.equal(audio.src, 'app://local/Audio/two.mp3');
  assert.equal(player.audio, audio);
  assert.equal(player.file.path, files[1].path);
  assert.deepEqual(Array.from(player.queuePaths), files.map(file => file.path));
  player.stop();
  assert.equal(audio.paused, true);
  assert.equal(audio.src, '');
});

test('the native media element keeps volume and speed state', () => {
  const { player, audio } = createPlayer();
  player.play(files[0], [files[0].path], 'Audio');
  player.pause();
  assert.equal(player.playing, false);
  player.resume();
  assert.equal(player.playing, true);
  audio.currentTime = 90;
  assert.equal(player.position, 90);
  audio.volume = 0.35;
  audio.playbackRate = 1.5;
  audio.dispatch('volumechange');
  audio.dispatch('ratechange');
  assert.equal(player.volume, 0.35);
  assert.equal(player.rate, 1.5);
  assert.equal(audio.volume, 0.35);
  assert.equal(audio.playbackRate, 1.5);
});

test('end advances in the original folder queue', () => {
  const { player, audio } = createPlayer();
  player.play(files[0], files.map(file => file.path), 'Audio');
  audio.dispatch('ended');
  assert.equal(player.file.path, files[1].path);
  assert.equal(player.audio, audio);
});
