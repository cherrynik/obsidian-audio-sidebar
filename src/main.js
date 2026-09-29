const { Plugin, ItemView, TFolder, TFile, Notice, setIcon } = require('obsidian');
const { SingleAudioPlayer } = require('./player');

const VIEW_TYPE = 'cherrynik-audio-sidebar';
const AUDIO_EXTENSIONS = new Set(['mp3', 'wav', 'ogg', 'flac', 'm4a', 'webm', 'aac']);
const formatTime = seconds => {
  const total = Math.max(0, Math.floor(Number(seconds) || 0));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
};

class AudioSidebarView extends ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
    this.folder = null;
    this.search = '';
  }

  getViewType() { return VIEW_TYPE; }
  getDisplayText() { return 'Audio'; }
  getIcon() { return 'music'; }

  async onOpen() {
    const root = this.containerEl.children[1];
    root.empty();
    root.addClass('audio-sb-view');
    this.body = root.createEl('div', { cls: 'audio-sb-body' });
    this.footer = root.createEl('div', { cls: 'audio-sb-footer' });
    this.footer.createEl('div', { text: 'Now playing', cls: 'audio-sb-footer-label' });
    this.title = this.footer.createEl('div', { cls: 'audio-sb-current-title' });
    const controls = this.footer.createEl('div', { cls: 'audio-sb-controls' });
    this.previous = this.iconButton(controls, 'skip-back', 'Previous track', () => this.plugin.player.playRelative(-1));
    this.toggle = this.iconButton(controls, 'play', 'Play or pause', () => this.plugin.player.toggle());
    this.next = this.iconButton(controls, 'skip-forward', 'Next track', () => this.plugin.player.playRelative(1));
    this.stop = this.iconButton(controls, 'square', 'Stop', () => this.plugin.player.stop());
    const timeline = this.footer.createEl('div', { cls: 'audio-sb-timeline' });
    this.elapsed = timeline.createEl('span', { cls: 'audio-sb-timeline-time' });
    this.seek = timeline.createEl('input', {
      cls: 'audio-sb-timeline-slider', type: 'range',
      attr: { min: '0', max: '100', step: '0.1', 'aria-label': 'Seek current track' }
    });
    this.seek.addEventListener('pointerdown', () => { this.seeking = true; });
    const finishSeeking = () => { this.seeking = false; this.updatePlayer(); };
    this.seek.addEventListener('pointerup', finishSeeking);
    this.seek.addEventListener('pointercancel', finishSeeking);
    this.seek.addEventListener('blur', finishSeeking);
    this.seek.addEventListener('input', () => {
      this.plugin.player.seek(this.seek.value);
      this.elapsed.textContent = formatTime(this.seek.value);
    });
    this.duration = timeline.createEl('span', { cls: 'audio-sb-timeline-time' });

    const actions = this.footer.createEl('div', { cls: 'audio-sb-player-settings' });
    this.repeat = this.iconButton(actions, 'repeat-2', 'Repeat current track', () => {
      this.plugin.player.setRepeatOne(!this.plugin.player.repeatOne);
    });
    this.queuePopover = this.createPopover(actions, 'list-music', 'Playback queue');
    this.queuePopover.popup.addClass('audio-sb-queue-popup');
    this.volumePopover = this.createPopover(actions, 'volume-2', 'Volume');
    this.volumeSlider = this.createSlider(this.volumePopover.popup, 'Volume', 0, 100, 1,
      Math.round(this.plugin.player.volume * 100), value => this.plugin.player.setVolume(value / 100));
    this.volumeSlider.addEventListener('change', () => this.plugin.savePlayerSettings());
    this.ratePopover = this.createPopover(actions, 'gauge', 'Playback speed');
    this.rateSlider = this.createSlider(this.ratePopover.popup, 'Speed', 0.5, 2, 0.05,
      this.plugin.player.rate, value => this.plugin.player.setRate(value));
    this.rateSlider.addEventListener('change', () => this.plugin.savePlayerSettings());
    this.outsideClick = event => {
      if (!event.target.closest('.audio-sb-control-wrap')) this.closePopovers();
    };
    document.addEventListener('pointerdown', this.outsideClick);
    this.timer = window.setInterval(() => this.updateProgress(), 500);
    this.showFolder(this.plugin.selectedFolder);
    this.updatePlayer();
  }

  iconButton(parent, icon, label, action) {
    const button = parent.createEl('button', {
      cls: 'audio-sb-icon-btn', type: 'button',
      attr: { 'aria-label': label, title: label }
    });
    setIcon(button, icon);
    button.onclick = action;
    return button;
  }

  createPopover(parent, icon, label) {
    const wrap = parent.createEl('div', { cls: 'audio-sb-control-wrap' });
    const button = this.iconButton(wrap, icon, label, () => {
      const show = popup.classList.contains('audio-sb-hidden');
      this.closePopovers();
      if (show) popup.classList.remove('audio-sb-hidden');
    });
    const popup = wrap.createEl('div', { cls: 'audio-sb-control-popup audio-sb-hidden' });
    wrap.addEventListener('pointerenter', event => {
      if (event.pointerType === 'mouse') {
        this.closePopovers();
        popup.classList.remove('audio-sb-hidden');
      }
    });
    wrap.addEventListener('pointerleave', event => {
      if (event.pointerType === 'mouse') popup.classList.add('audio-sb-hidden');
    });
    return { button, popup };
  }

  closePopovers() {
    this.footer.querySelectorAll('.audio-sb-control-popup').forEach(popup => popup.classList.add('audio-sb-hidden'));
  }

  createSlider(parent, label, min, max, step, initial, onInput) {
    parent.createEl('span', { text: label, cls: 'audio-sb-control-label' });
    const slider = parent.createEl('input', {
      cls: 'audio-sb-vertical-slider', type: 'range',
      attr: { min: String(min), max: String(max), step: String(step), 'aria-label': label }
    });
    slider.value = String(initial);
    const value = parent.createEl('span', { cls: 'audio-sb-control-value' });
    const update = () => {
      const number = Number(slider.value);
      value.textContent = label === 'Volume' ? `${Math.round(number)}%` : `${number.toFixed(2).replace(/0$/, '').replace(/\.0$/, '')}×`;
      slider.style.setProperty('--audio-sb-slider-progress', `${((number - min) / (max - min)) * 100}%`);
    };
    slider.addEventListener('input', () => { update(); onInput(Number(slider.value)); });
    update();
    return slider;
  }

  showFolder(folder) {
    if (!(folder instanceof TFolder)) return;
    this.folder = folder;
    this.renderFolder();
  }

  renderFolder() {
    this.body.empty();
    if (!this.folder) {
      this.body.createEl('div', { text: 'Choose an audio folder in Files.', cls: 'audio-sb-empty' });
      return;
    }
    const files = this.plugin.findAudioInFolder(this.folder);
    const header = this.body.createEl('div', { cls: 'audio-sb-header' });
    header.createEl('span', { text: this.folder.name || 'Audio', cls: 'audio-sb-folder-name' });
    header.createEl('span', { text: `${files.length} tracks`, cls: 'audio-sb-count' });
    const search = this.body.createEl('input', {
      cls: 'audio-sb-search', type: 'search',
      attr: { placeholder: 'Search tracks…', 'aria-label': 'Search tracks' }
    });
    search.value = this.search;
    search.addEventListener('input', () => { this.search = search.value; this.filterRows(); });
    this.list = this.body.createEl('div', { cls: 'audio-sb-list' });
    for (const file of files) {
      const row = this.list.createEl('div', { cls: 'audio-sb-item' });
      row.dataset.path = file.path;
      row.dataset.name = file.basename.toLowerCase();
      const button = this.iconButton(row, 'play', `Play ${file.basename}`, () => {
        const player = this.plugin.player;
        if (player.file?.path === file.path) player.toggle();
        else player.play(file, files.map(item => item.path), this.folder.name);
      });
      button.addClass('audio-sb-track-play');
      row.createEl('span', { text: file.basename, cls: 'audio-sb-track-name' });
      const length = row.createEl('span', { cls: 'audio-sb-track-duration' });
      const probe = document.createElement('audio');
      probe.preload = 'metadata';
      probe.src = this.app.vault.getResourcePath(file);
      probe.addEventListener('loadedmetadata', () => { length.textContent = formatTime(probe.duration); });
    }
    this.filterRows();
    this.updateTrackList();
  }

  filterRows() {
    const query = this.search.trim().toLowerCase();
    this.list?.querySelectorAll('.audio-sb-item').forEach(row => {
      row.toggleClass('audio-sb-hidden', !!query && !row.dataset.name.includes(query));
    });
  }

  updateTrackList() {
    const player = this.plugin.player;
    this.list?.querySelectorAll('.audio-sb-item').forEach(row => {
      const active = row.dataset.path === player.file?.path;
      row.toggleClass('audio-sb-item-active', active);
      const button = row.querySelector('button');
      if (!button) return;
      const playing = active && player.playing;
      button.empty();
      setIcon(button, playing ? 'pause' : 'play');
      button.setAttribute('aria-label', `${playing ? 'Pause' : 'Play'} ${row.querySelector('.audio-sb-track-name')?.textContent}`);
    });
  }

  updatePlayer() {
    const player = this.plugin.player;
    const hasTrack = !!player.file;
    this.title.textContent = player.file?.basename || 'Nothing playing';
    for (const button of [this.previous, this.toggle, this.next, this.stop]) button.disabled = !hasTrack;
    this.toggle.empty();
    setIcon(this.toggle, player.playing ? 'pause' : 'play');
    this.toggle.setAttribute('aria-label', player.playing ? 'Pause' : 'Play');
    this.repeat.empty();
    setIcon(this.repeat, player.repeatOne ? 'repeat-1' : 'repeat-2');
    this.repeat.setAttribute('aria-pressed', String(player.repeatOne));
    this.repeat.title = player.repeatOne ? 'Repeat current track: on' : 'Repeat current track: off';
    this.queuePopover.button.disabled = !player.queuePaths.length;
    this.updateQueue();
    this.updateProgress();
    this.updateTrackList();
  }

  updateProgress() {
    const player = this.plugin.player;
    const duration = player.duration;
    this.seek.disabled = !player.file || duration <= 0;
    this.seek.max = String(duration || 100);
    if (!this.seeking) this.seek.value = String(player.position);
    this.elapsed.textContent = formatTime(player.position);
    this.duration.textContent = formatTime(duration);
  }

  updateQueue() {
    const popup = this.queuePopover.popup;
    const scroll = popup.scrollTop;
    popup.empty();
    popup.createEl('div', {
      text: `${this.plugin.player.queueName || 'Audio'} · ${this.plugin.player.queuePaths.length} tracks`,
      cls: 'audio-sb-queue-heading'
    });
    this.plugin.player.queuePaths.forEach((path, index) => {
      const file = this.app.vault.getAbstractFileByPath(path);
      if (!(file instanceof TFile)) return;
      const row = popup.createEl('button', { cls: 'audio-sb-queue-item', type: 'button' });
      row.toggleClass('audio-sb-queue-current', path === this.plugin.player.file?.path);
      row.createEl('span', { text: String(index + 1), cls: 'audio-sb-queue-index' });
      row.createEl('span', { text: file.basename, cls: 'audio-sb-queue-name' });
      row.onclick = () => this.plugin.player.play(file, this.plugin.player.queuePaths, this.plugin.player.queueName);
    });
    popup.scrollTop = scroll;
  }

  async onClose() {
    window.clearInterval(this.timer);
    document.removeEventListener('pointerdown', this.outsideClick);
  }
}

class AudioSidebarPlugin extends Plugin {
  async onload() {
    const saved = await this.loadData() || {};
    this.settings = {
      volume: Math.max(0, Math.min(1, Number(saved.volume ?? (saved.masterVolume == null ? 1 : saved.masterVolume / 100)))),
      rate: Math.max(0.5, Math.min(2, Number(saved.rate ?? saved.playbackRate ?? 1)))
    };
    await this.saveData(this.settings);
    this.player = new SingleAudioPlayer(this.app,
      () => this.refreshViews(), error => new Notice(`Could not play audio: ${error}`), this.settings);
    this.registerView(VIEW_TYPE, leaf => new AudioSidebarView(leaf, this));
    this.addRibbonIcon('music', 'Audio Sidebar', () => this.activateView());
    this.addCommand({ id: 'next-track', name: 'Play next track', callback: () => this.player.playRelative(1) });
    this.addCommand({ id: 'previous-track', name: 'Play previous track', callback: () => this.player.playRelative(-1) });
    this.addCommand({ id: 'toggle-playback', name: 'Play or pause', callback: () => this.player.toggle() });
    this.addCommand({ id: 'stop-playback', name: 'Stop playback', callback: () => this.player.stop() });
    this.registerDomEvent(window, 'keydown', event => {
      if (event.key === 'MediaTrackNext') { event.preventDefault(); this.player.playRelative(1); }
      if (event.key === 'MediaTrackPrevious') { event.preventDefault(); this.player.playRelative(-1); }
    });
    this.registerDomEvent(this.app.workspace.containerEl, 'play', event => this.handoffNativeAudio(event), true);
    this.registerDomEvent(this.app.workspace.containerEl, 'click', event => this.followFolderClick(event));
    this.registerEvent(this.app.vault.on('delete', file => {
      if (file.path === this.player.file?.path) this.player.stop();
    }));
    this.app.workspace.onLayoutReady(() => {
      const folder = this.app.vault.getAbstractFileByPath('Audio');
      if (folder instanceof TFolder) this.selectedFolder = folder;
      this.activateView().then(() => {
        for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE)) {
          if (leaf.view instanceof AudioSidebarView) leaf.view.showFolder(this.selectedFolder);
        }
      });
    });
  }

  async savePlayerSettings() {
    this.settings.volume = this.player.volume;
    this.settings.rate = this.player.rate;
    await this.saveData(this.settings);
  }

  findAudioInFolder(folder) {
    const files = [];
    const visit = current => {
      for (const child of current.children) {
        if (child instanceof TFolder) visit(child);
        else if (child instanceof TFile && AUDIO_EXTENSIONS.has(child.extension.toLowerCase())) files.push(child);
      }
    };
    visit(folder);
    return files.sort((a, b) => a.basename.localeCompare(b.basename));
  }

  refreshViews() {
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE)) {
      if (leaf.view instanceof AudioSidebarView) leaf.view.updatePlayer();
    }
    this.updateMediaSession();
  }

  updateMediaSession() {
    const session = navigator.mediaSession;
    if (!session) return;
    const player = this.player;
    if (!player.file) {
      if (this.mediaSessionOwned) {
        for (const action of ['nexttrack', 'previoustrack', 'play', 'pause']) {
          try { session.setActionHandler(action, null); } catch (_) { /* Unsupported action. */ }
        }
        session.metadata = null;
        session.playbackState = 'none';
        this.mediaSessionOwned = false;
      }
      return;
    }
    this.mediaSessionOwned = true;
    if (typeof MediaMetadata !== 'undefined' && session.metadata?.title !== player.file.basename) {
      session.metadata = new MediaMetadata({ title: player.file.basename, artist: 'CherryNIK Audio Sidebar' });
    }
    session.playbackState = player.playing ? 'playing' : 'paused';
    const actions = {
      nexttrack: () => player.playRelative(1),
      previoustrack: () => player.playRelative(-1),
      play: () => player.resume(),
      pause: () => player.pause()
    };
    for (const [action, handler] of Object.entries(actions)) {
      try { session.setActionHandler(action, handler); } catch (_) { /* Unsupported action. */ }
    }
  }

  followFolderClick(event) {
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest('.collapse-icon')) return;
    const path = target?.closest('.nav-folder-title')?.dataset.path ?? target?.closest('.nv-row')?.dataset.key;
    if (!path || (path !== 'Audio' && !path.startsWith('Audio/'))) return;
    const folder = this.app.vault.getAbstractFileByPath(path);
    if (!(folder instanceof TFolder)) return;
    this.selectedFolder = folder;
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE)) {
      if (leaf.view instanceof AudioSidebarView && leaf.view.folder?.path !== folder.path) leaf.view.showFolder(folder);
    }
  }

  async handoffNativeAudio(event) {
    const audio = event.target;
    if (!(audio instanceof HTMLAudioElement) || audio.closest('.audio-sb-view')) return;
    const source = audio.currentSrc || audio.src;
    const file = this.app.vault.getFiles().find(candidate =>
      AUDIO_EXTENSIONS.has(candidate.extension.toLowerCase()) &&
      this.app.vault.getResourcePath(candidate).split('?')[0] === source.split('?')[0]);
    if (!file) return;
    const startTime = Number.isFinite(audio.currentTime) ? audio.currentTime : 0;
    audio.pause();
    await this.activateView();
    const queue = this.findAudioInFolder(file.parent).map(item => item.path);
    this.player.play(file, queue, file.parent.name, startTime);
  }

  async activateView() {
    const existing = this.app.workspace.getLeavesOfType(VIEW_TYPE);
    if (existing.length) {
      this.app.workspace.revealLeaf(existing[0]);
      return;
    }
    const leaf = this.app.workspace.getRightLeaf(false);
    if (!leaf) return;
    await leaf.setViewState({ type: VIEW_TYPE, active: true });
    this.app.workspace.revealLeaf(leaf);
  }

  onunload() {
    this.player.stop();
    this.app.workspace.detachLeavesOfType(VIEW_TYPE);
  }
}

module.exports = AudioSidebarPlugin;
