const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { test } = require('node:test');
const vm = require('node:vm');

class FakeHowl {
  static instances = [];
  constructor(options) {
    this.options = options;
    this.isPlaying = false;
    this.position = 0;
    this.length = 180;
    this.unloaded = false;
    this.level = options.volume;
    this.speed = options.rate;
    FakeHowl.instances.push(this);
  }
  playing() { return this.isPlaying; }
  play() { this.isPlaying = true; this.options.onplay?.(); }
  pause() { this.isPlaying = false; this.options.onpause?.(); }
  stop() { this.isPlaying = false; this.position = 0; }
  unload() { this.unloaded = true; }
  seek(value) { if (value !== undefined) this.position = value; return this.position; }
  duration() { return this.length; }
  volume(value) { if (value !== undefined) this.level = value; return this.level; }
  rate(value) { if (value !== undefined) this.speed = value; return this.speed; }
}

const loaded = { exports: {} };
vm.runInNewContext(readFileSync('src/player.js', 'utf8'), {
  module: loaded,
  require: name => {
    assert.equal(name, 'howler');
    return { Howl: FakeHowl };
  }
});
const { SingleAudioPlayer } = loaded.exports;
const files = ['Audio/one.mp3', 'Audio/two.mp3'].map(path => ({
  path, basename: path.split('/').pop(), extension: 'mp3', parent: { name: 'Audio' }
}));
const app = { vault: {
  getResourcePath: file => `app://local/${file.path}`,
  getAbstractFileByPath: path => files.find(file => file.path === path)
} };

test('starting another track releases the previous one and keeps its folder queue', () => {
  FakeHowl.instances.length = 0;
  const player = new SingleAudioPlayer(app, () => {}, () => {}, { volume: 0.8, rate: 1.25 });
  player.play(files[0], files.map(file => file.path), 'Audio');
  const first = FakeHowl.instances[0];
  assert.equal(first.options.html5, true);
  assert.equal(first.options.preload, 'metadata');
  player.playRelative(1);
  assert.equal(first.unloaded, true);
  assert.equal(player.file.path, files[1].path);
  assert.deepEqual(Array.from(player.queuePaths), files.map(file => file.path));
  assert.equal(FakeHowl.instances.filter(sound => sound.isPlaying).length, 1);
  player.stop();
  assert.equal(FakeHowl.instances.filter(sound => sound.isPlaying).length, 0);
});

test('the one active track supports pause, resume, seek, volume and speed', () => {
  const player = new SingleAudioPlayer(app, () => {}, () => {}, { volume: 1, rate: 1 });
  player.play(files[0], [files[0].path], 'Audio');
  player.pause();
  assert.equal(player.playing, false);
  player.resume();
  assert.equal(player.playing, true);
  player.seek(90);
  assert.equal(player.position, 90);
  player.setVolume(0.35);
  player.setRate(1.5);
  assert.equal(player.sound.level, 0.35);
  assert.equal(player.sound.speed, 1.5);
  player.stop();
});

test('finishing a track advances without leaving its old sound loaded', () => {
  const player = new SingleAudioPlayer(app, () => {}, () => {}, { volume: 1, rate: 1 });
  player.play(files[0], files.map(file => file.path), 'Audio');
  const first = player.sound;
  first.options.onend();
  assert.equal(player.file.path, files[1].path);
  assert.equal(first.unloaded, true);
  assert.equal(FakeHowl.instances.filter(sound => sound.isPlaying).length, 1);
  player.stop();
});
