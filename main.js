const { Modal, Notice, Plugin, ItemView, PluginSettingTab, Setting, TFolder, TFile, setIcon, normalizePath } = require('obsidian');

const VIEW_TYPE = 'cherrynik-audio-sidebar';
const AUDIO_EXTENSIONS = ['mp3', 'wav', 'ogg', 'flac', 'm4a', 'webm', 'aac'];
const DEFAULT_SETTINGS = {
  defaultFolderPath: '',
  sfxFolderPath: '',
  loopFolderPath: '',
  continuePlayback: false,
  allowMusicOverlap: false,
  masterVolume: 100,
  musicVolume: 100,
  sfxVolume: 100,
  loopVolume: 100,
  playbackRate: 1,
  musicFadeMs: 1500
};

// ─── SFX Picker Modal ────────────────────────────────────────────────────────
// Searchable modal for one-shot sound effects. Opened via the sidebar toolbar
// or the "Open sound effects picker" command.

class AudioSfxModal extends Modal {
  constructor(app, plugin, files) {
    super(app);
    this.plugin = plugin;
    this.files = files;
    this.filteredFiles = files;
  }

  onOpen() {
    this.modalEl.addClass('audio-sb-sfx-modal');
    const { contentEl } = this;
    contentEl.empty();

    const searchEl = contentEl.createEl('input', {
      cls: 'audio-sb-sfx-search',
      type: 'text',
      placeholder: 'Search sound effects...'
    });

    const listEl = contentEl.createEl('div', { cls: 'audio-sb-sfx-list' });
    this.renderList(listEl);

    searchEl.addEventListener('input', () => {
      const query = searchEl.value.toLowerCase().trim();
      this.filteredFiles = this.files.filter(file =>
        !query ||
        file.basename.toLowerCase().includes(query) ||
        file.path.toLowerCase().includes(query)
      );
      this.renderList(listEl);
    });

    searchEl.focus();
  }

  renderList(listEl) {
    listEl.empty();

    if (this.filteredFiles.length === 0) {
      listEl.createEl('div', {
        text: 'No matching sound effects.',
        cls: 'audio-sb-sfx-empty'
      });
      return;
    }

    for (const file of this.filteredFiles) {
      const rowEl = listEl.createEl('div', { cls: 'audio-sb-sfx-modal-row' });

      const itemEl = rowEl.createEl('button', {
        cls: 'audio-sb-sfx-item',
        type: 'button'
      });
      itemEl.createEl('span', { text: '♪', cls: 'audio-sb-sfx-icon' });
      itemEl.createEl('div', { text: file.basename, cls: 'audio-sb-sfx-name' });
      itemEl.onclick = () => {
        this.close();
        this.plugin.playSfx(file);
      };

      // Copy button: produces a ready-to-paste audiosfx codeblock using
      // folder#basename syntax so the path is explicit and always resolvable.
      const copyBtn = rowEl.createEl('button', {
        cls: 'audio-sb-sfx-copy',
        type: 'button',
        attr: { 'aria-label': 'Copy audiosfx codeblock' }
      });
      setIcon(copyBtn, 'copy');
      copyBtn.onclick = () => {
        const parent = file.parent;
        const folderPath = parent && parent.path && parent.path !== '/' ? parent.path : null;
        const ref = folderPath ? `${folderPath}#${file.basename}` : file.basename;
        navigator.clipboard.writeText(`\`\`\`audiosfx\n${ref}\n\`\`\``);
        new Notice('Codeblock copied');
      };
    }
  }

  onClose() {
    this.contentEl.empty();
  }
}

// ─── Loop Picker Modal ───────────────────────────────────────────────────────
// Searchable modal for looping ambient sounds. Clicking a row toggles the loop
// on or off; active loops are highlighted so you can see what's running.

class AudioLoopModal extends Modal {
  constructor(app, plugin, files) {
    super(app);
    this.plugin = plugin;
    this.files = files;
    this.filteredFiles = files;
  }

  onOpen() {
    this.modalEl.addClass('audio-sb-sfx-modal');
    const { contentEl } = this;
    contentEl.empty();

    const searchEl = contentEl.createEl('input', {
      cls: 'audio-sb-sfx-search',
      type: 'text',
      placeholder: 'Search loops...'
    });

    this._listEl = contentEl.createEl('div', { cls: 'audio-sb-sfx-list' });
    this.renderList();

    searchEl.addEventListener('input', () => {
      const query = searchEl.value.toLowerCase().trim();
      this.filteredFiles = this.files.filter(file =>
        !query ||
        file.basename.toLowerCase().includes(query) ||
        file.path.toLowerCase().includes(query)
      );
      this.renderList();
    });

    searchEl.focus();
  }

  renderList() {
    const listEl = this._listEl;
    listEl.empty();

    if (this.filteredFiles.length === 0) {
      listEl.createEl('div', {
        text: 'No matching loops.',
        cls: 'audio-sb-sfx-empty'
      });
      return;
    }

    for (const file of this.filteredFiles) {
      const isActive = this.plugin._activeLoops.has(file.path);
      const rowEl = listEl.createEl('div', { cls: 'audio-sb-sfx-modal-row' });

      const itemEl = rowEl.createEl('button', {
        cls: `audio-sb-sfx-item${isActive ? ' audio-sb-loop-item-active' : ''}`,
        type: 'button'
      });
      const iconEl = itemEl.createEl('span', { cls: 'audio-sb-sfx-icon' });
      setIcon(iconEl, isActive ? 'square' : 'play');
      itemEl.createEl('div', { text: file.basename, cls: 'audio-sb-sfx-name' });
      itemEl.onclick = () => {
        if (this.plugin._activeLoops.has(file.path)) {
          this.plugin.stopLoop(file);
        } else {
          this.plugin.playLoop(file);
        }
        this.renderList();
      };

      const copyBtn = rowEl.createEl('button', {
        cls: 'audio-sb-sfx-copy',
        type: 'button',
        attr: { 'aria-label': 'Copy audioloop codeblock' }
      });
      setIcon(copyBtn, 'copy');
      copyBtn.onclick = () => {
        const parent = file.parent;
        const folderPath = parent && parent.path && parent.path !== '/' ? parent.path : null;
        const ref = folderPath ? `${folderPath}#${file.basename}` : file.basename;
        navigator.clipboard.writeText(`\`\`\`audioloop\n${ref}\n\`\`\``);
        new Notice('Codeblock copied');
      };
    }
  }

  onClose() {
    this.contentEl.empty();
  }
}

// ─── Create Scene Modal ──────────────────────────────────────────────────────
// Lets you pick one music track and any number of loops, then generates a
// ready-to-paste audioscene codeblock that triggers the whole set at once.

class CreateSceneModal extends Modal {
  constructor(app, plugin) {
    super(app);
    this.plugin = plugin;
    this.sceneName = '';
    this.selectedMusic = null;       // TFile | null
    this.selectedLoops = new Map();  // Map<path, TFile>
    this._musicFiles = [];
    this._loopFiles = [];
    this._filteredMusicFiles = [];
    this._filteredLoopFiles = [];
  }

  onOpen() {
    this.modalEl.addClass('audio-sb-scene-modal');
    const { contentEl } = this;
    contentEl.empty();

    contentEl.createEl('h2', { text: 'Create Scene', cls: 'audio-sb-scene-title' });

    // Scene name
    const nameRow = contentEl.createEl('div', { cls: 'audio-sb-scene-row' });
    nameRow.createEl('label', { text: 'Scene name', cls: 'audio-sb-scene-label' });
    const nameInput = nameRow.createEl('input', {
      type: 'text',
      cls: 'audio-sb-scene-name-input',
      placeholder: 'e.g. Tavern Night'
    });
    nameInput.addEventListener('input', () => {
      this.sceneName = nameInput.value;
      this._updatePreview();
    });

    // Music section
    contentEl.createEl('div', { text: 'Music track (optional — single select)', cls: 'audio-sb-scene-section-label' });
    const musicSearchEl = contentEl.createEl('input', {
      type: 'text',
      cls: 'audio-sb-sfx-search audio-sb-scene-search',
      placeholder: 'Search music...'
    });
    this._musicListEl = contentEl.createEl('div', { cls: 'audio-sb-sfx-list audio-sb-scene-list' });

    this._loadMusicFiles();
    this._renderMusicList();

    musicSearchEl.addEventListener('input', () => {
      const q = musicSearchEl.value.toLowerCase().trim();
      this._filteredMusicFiles = this._musicFiles.filter(f =>
        !q || f.basename.toLowerCase().includes(q)
      );
      this._renderMusicList();
    });

    // Loops section
    contentEl.createEl('div', { text: 'Loops (multi-select)', cls: 'audio-sb-scene-section-label' });
    const loopSearchEl = contentEl.createEl('input', {
      type: 'text',
      cls: 'audio-sb-sfx-search audio-sb-scene-search',
      placeholder: 'Search loops...'
    });
    this._loopListEl = contentEl.createEl('div', { cls: 'audio-sb-sfx-list audio-sb-scene-list' });

    this._loadLoopFiles();
    this._renderLoopList();

    loopSearchEl.addEventListener('input', () => {
      const q = loopSearchEl.value.toLowerCase().trim();
      this._filteredLoopFiles = this._loopFiles.filter(f =>
        !q || f.basename.toLowerCase().includes(q)
      );
      this._renderLoopList();
    });

    // Codeblock preview
    contentEl.createEl('div', { text: 'Generated codeblock', cls: 'audio-sb-scene-section-label' });
    this._previewEl = contentEl.createEl('pre', { cls: 'audio-sb-scene-preview' });
    this._codeEl = this._previewEl.createEl('code');

    // Copy button
    const actionsRow = contentEl.createEl('div', { cls: 'audio-sb-scene-actions' });
    const copyBtn = actionsRow.createEl('button', {
      text: 'Copy codeblock',
      cls: 'audio-sb-load-btn'
    });
    copyBtn.onclick = () => {
      const code = this._buildCodeblock();
      if (!code) {
        new Notice('Enter a scene name first.');
        return;
      }
      navigator.clipboard.writeText(code);
      new Notice('Scene codeblock copied!');
    };

    this._updatePreview();
    nameInput.focus();
  }

  _loadMusicFiles() {
    let folder = null;
    const leaves = this.plugin.app.workspace.getLeavesOfType(VIEW_TYPE);
    for (const leaf of leaves) {
      if (leaf.view instanceof AudioSidebarView && leaf.view._loadedFolder) {
        folder = leaf.view._loadedFolder;
        break;
      }
    }
    if (!folder) folder = this.plugin.getDefaultFolder();
    this._musicFolder = folder;
    this._musicFiles = folder ? this.plugin.findAudioInFolder(folder) : [];
    this._filteredMusicFiles = [...this._musicFiles];
  }

  _loadLoopFiles() {
    const folder = this.plugin.getLoopFolder();
    this._loopFiles = folder ? this.plugin.findAudioInFolder(folder) : [];
    this._filteredLoopFiles = [...this._loopFiles];
  }

  _renderMusicList() {
    const listEl = this._musicListEl;
    listEl.empty();

    if (this._musicFiles.length === 0) {
      listEl.createEl('div', {
        text: 'No music folder loaded. Load a folder in the sidebar first.',
        cls: 'audio-sb-sfx-empty'
      });
      return;
    }

    // "No music" option
    const noneRow = listEl.createEl('div', { cls: 'audio-sb-sfx-modal-row' });
    const noneBtn = noneRow.createEl('button', {
      cls: `audio-sb-sfx-item${!this.selectedMusic ? ' audio-sb-scene-selected' : ''}`,
      type: 'button'
    });
    const noneIconEl = noneBtn.createEl('span', { cls: 'audio-sb-sfx-icon' });
    setIcon(noneIconEl, !this.selectedMusic ? 'check' : 'minus');
    noneBtn.createEl('div', { text: 'No music', cls: 'audio-sb-sfx-name' });
    noneBtn.onclick = () => {
      this.selectedMusic = null;
      this._renderMusicList();
      this._updatePreview();
    };

    if (this._filteredMusicFiles.length === 0) {
      listEl.createEl('div', { text: 'No matching tracks.', cls: 'audio-sb-sfx-empty' });
      return;
    }

    for (const file of this._filteredMusicFiles) {
      const isSelected = this.selectedMusic?.path === file.path;
      const rowEl = listEl.createEl('div', { cls: 'audio-sb-sfx-modal-row' });
      const itemEl = rowEl.createEl('button', {
        cls: `audio-sb-sfx-item${isSelected ? ' audio-sb-scene-selected' : ''}`,
        type: 'button'
      });
      const iconEl = itemEl.createEl('span', { cls: 'audio-sb-sfx-icon' });
      setIcon(iconEl, isSelected ? 'check' : 'music');
      itemEl.createEl('div', { text: file.basename, cls: 'audio-sb-sfx-name' });
      itemEl.onclick = () => {
        this.selectedMusic = file;
        this._renderMusicList();
        this._updatePreview();
      };
    }
  }

  _renderLoopList() {
    const listEl = this._loopListEl;
    listEl.empty();

    if (this._loopFiles.length === 0) {
      listEl.createEl('div', {
        text: 'No loop folder configured in settings.',
        cls: 'audio-sb-sfx-empty'
      });
      return;
    }

    if (this._filteredLoopFiles.length === 0) {
      listEl.createEl('div', { text: 'No matching loops.', cls: 'audio-sb-sfx-empty' });
      return;
    }

    for (const file of this._filteredLoopFiles) {
      const isSelected = this.selectedLoops.has(file.path);
      const rowEl = listEl.createEl('div', { cls: 'audio-sb-sfx-modal-row' });
      const itemEl = rowEl.createEl('button', {
        cls: `audio-sb-sfx-item${isSelected ? ' audio-sb-scene-selected' : ''}`,
        type: 'button'
      });
      const iconEl = itemEl.createEl('span', { cls: 'audio-sb-sfx-icon' });
      setIcon(iconEl, isSelected ? 'check' : 'repeat-2');
      itemEl.createEl('div', { text: file.basename, cls: 'audio-sb-sfx-name' });
      itemEl.onclick = () => {
        if (this.selectedLoops.has(file.path)) {
          this.selectedLoops.delete(file.path);
        } else {
          this.selectedLoops.set(file.path, file);
        }
        this._renderLoopList();
        this._updatePreview();
      };
    }
  }

  _buildCodeblock() {
    const name = this.sceneName.trim();
    if (!name) return '';
    const lines = [`name: ${name}`];
    if (this.selectedMusic) {
      const folder = this.selectedMusic.parent;
      const ref = folder && folder.path !== '/' ? `${folder.path}#${this.selectedMusic.basename}` : this.selectedMusic.basename;
      lines.push(`music: ${ref}`);
    }
    for (const [, file] of this.selectedLoops) {
      const folder = file.parent;
      const ref = folder && folder.path !== '/' ? `${folder.path}#${file.basename}` : file.basename;
      lines.push(`loop: ${ref}`);
    }
    return `\`\`\`audioscene\n${lines.join('\n')}\n\`\`\``;
  }

  _updatePreview() {
    if (!this._codeEl) return;
    if (!this.sceneName.trim()) {
      this._codeEl.textContent = '(enter a scene name to generate the codeblock)';
      return;
    }
    this._codeEl.textContent = this._buildCodeblock();
  }

  onClose() {
    this.contentEl.empty();
  }
}

// ─── Sidebar View ─────────────────────────────────────────────────────────────
// Persistent ItemView rendered in the right panel. Survives note navigation
// because Obsidian only unmounts it when the leaf is explicitly closed.

class AudioSidebarView extends ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType() { return VIEW_TYPE; }
  getDisplayText() { return 'Audio'; }
  getIcon() { return 'music'; }

  async onOpen() {
    this.draw(null);
  }

  // Rebuilds the entire sidebar DOM. Called once on open and again after a
  // settings change that requires a full redraw (e.g. overlap toggle).
  draw(folder) {
    this._looping = this._looping === true;
    this._suppressPauseSync = false;
    const content = this.containerEl.children[1];
    content.empty();
    content.addClass('audio-sb-view');

    this._bodyEl = content.createEl('div', { cls: 'audio-sb-body' });
    // Active players live here while the visible folder list is rebuilt.
    this._persistentAudioEl = content.createEl('div', { cls: 'audio-sb-persistent-audio' });
    this._persistentAudioEl.style.display = 'none';
    this._footerEl = content.createEl('div', { cls: 'audio-sb-footer' });
    this._footerEl.createEl('div', { text: 'Now playing', cls: 'audio-sb-footer-label' });
    this._nowPlayingListEl = this._footerEl.createEl('div', { cls: 'audio-sb-np-list' });
    this._upNextLabelEl = this._footerEl.createEl('div', { text: 'Up next', cls: 'audio-sb-footer-label audio-sb-up-next-label' });
    this._upNextListEl = this._footerEl.createEl('div', { cls: 'audio-sb-up-next-list' });
    this.renderTimeline(this._footerEl);
    const playerSettings = this._footerEl.createEl('div', { cls: 'audio-sb-player-settings' });
    this._loopBtn = playerSettings.createEl('button', {
      cls: 'audio-sb-repeat-btn audio-sb-loop-off',
      type: 'button',
      attr: { 'aria-label': 'Repeat current track' }
    });
    this._loopBtn.createEl('span', { text: 'Repeat', cls: 'audio-sb-repeat-label' });
    this._loopBtn.onclick = () => this.toggleLoop();
    this.updateLoopButton();
    this.renderGlobalVolume(playerSettings);
    this.renderPlaybackSpeed(playerSettings);

    if (this._nowPlayingTimer) window.clearInterval(this._nowPlayingTimer);
    this._nowPlayingTimer = window.setInterval(() => this._refreshNowPlayingTimes(), 500);

    this._currentAudio = null;
    this._currentTrackName = '';

    if (!this._loadedFolder) return;
    this.renderTracks(this._bodyEl, this._loadedFolder);
  }

  toggleLoop() {
    this._looping = !this._looping;
    this.updateLoopButton();
  }

  toggleMusicOverlap() {
    this.plugin.settings.allowMusicOverlap = !this.plugin.settings.allowMusicOverlap;
    this.plugin.saveSettings();
    this.applyMusicOverlapPolicy();
    this.updateOverlapButton();
  }

  updateLoopButton() {
    if (!this._loopBtn) return;
    this._loopBtn.empty();
    setIcon(this._loopBtn, this._looping ? 'repeat-1' : 'repeat-2');
    this._loopBtn.createEl('span', { text: this._looping ? 'Repeat 1' : 'Repeat', cls: 'audio-sb-repeat-label' });
    this._loopBtn.setAttribute('aria-pressed', String(this._looping));
    this._loopBtn.title = this._looping ? 'Repeat current track: on' : 'Repeat current track: off';
    this._loopBtn.classList.toggle('audio-sb-loop-on', this._looping);
    this._loopBtn.classList.toggle('audio-sb-loop-off', !this._looping);
  }

  updateOverlapButton() {
    if (!this._overlapBtn) return;
    const enabled = !!this.plugin.settings.allowMusicOverlap;
    this._overlapBtn.textContent = `Overlap: ${enabled ? 'On' : 'Off'}`;
    this._overlapBtn.title = enabled ? 'Disable music overlap' : 'Enable music overlap';
    this._overlapBtn.classList.toggle('audio-sb-loop-on', enabled);
    this._overlapBtn.classList.toggle('audio-sb-loop-off', !enabled);
  }

  toggleContinue() {
    this.plugin.settings.continuePlayback = !this.plugin.settings.continuePlayback;
    this.plugin.saveSettings();
    this.updateContinueButton();
  }

  updateContinueButton() {
    if (!this._continueBtn) return;
    const enabled = !!this.plugin.settings.continuePlayback;
    this._continueBtn.empty();
    setIcon(this._continueBtn, 'list-end');
    this._continueBtn.setAttribute('aria-pressed', String(enabled));
    this._continueBtn.title = enabled ? 'Disable continue playback' : 'Enable continue playback';
    this._continueBtn.classList.toggle('audio-sb-loop-on', enabled);
    this._continueBtn.classList.toggle('audio-sb-loop-off', !enabled);
  }

  playNextTrack(afterAudio) {
    this.playRelativeTrack(afterAudio, 1);
  }

  getVisibleQueue() {
    if (!this._trackList) return [];
    return Array.from(this._trackList.querySelectorAll('.audio-sb-item'))
      .filter(item => !item.classList.contains('audio-sb-hidden'))
      .map(item => item.querySelector('audio')?.dataset.trackPath)
      .filter(Boolean);
  }

  createDetachedTrack(path) {
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile) || !this._persistentAudioEl) return null;
    const audio = this._persistentAudioEl.createEl('audio');
    this.configureTrackAudio(audio, file);
    if (!this._detachedAudios) this._detachedAudios = new Set();
    this._detachedAudios.add(audio);
    return audio;
  }

  async playExternalFile(file, startTime = 0) {
    let audio = this.getTrackAudios().find(candidate => candidate.dataset.trackPath === file.path);
    if (!audio) audio = this.createDetachedTrack(file.path);
    if (!audio) throw new Error(`Could not create a player for ${file.path}`);

    const seek = () => {
      const duration = Number.isFinite(audio.duration) ? audio.duration : null;
      const targetTime = duration == null ? startTime : Math.min(startTime, Math.max(0, duration - 0.05));
      if (Number.isFinite(targetTime) && targetTime > 0) audio.currentTime = targetTime;
    };
    if (audio.readyState >= 1) seek();
    else audio.addEventListener('loadedmetadata', seek, { once: true });

    await this.fadeInTrack(audio);
  }

  playRelativeTrack(fromAudio, offset) {
    const currentPath = fromAudio?.dataset.trackPath;
    let queue = this._playQueuePaths?.length ? this._playQueuePaths : this.getVisibleQueue();
    if (!queue.length) return;

    let index = queue.indexOf(currentPath);
    if (index === -1) {
      queue = this.getVisibleQueue();
      index = offset > 0 ? -1 : 0;
    }
    if (!queue.length) return;

    const targetPath = queue[(index + offset + queue.length) % queue.length];
    let target = this.getTrackAudios().find(audio => audio.dataset.trackPath === targetPath);
    if (!target) target = this.createDetachedTrack(targetPath);
    if (!target || target === fromAudio) {
      if (target) target.currentTime = 0;
      return;
    }

    target.currentTime = 0;
    this.fadeInTrack(target).catch(() => {
      new Notice(`Could not play ${target.dataset.trackName || 'track'}`);
    });
  }

  getTrackAudios() {
    const visible = this._trackList ? Array.from(this._trackList.querySelectorAll('audio')) : [];
    const detached = this._detachedAudios ? Array.from(this._detachedAudios) : [];
    return Array.from(new Set([...visible, ...detached]));
  }

  getFadeDurationMs() {
    return this.plugin.clampFadeMs(this.plugin.settings.musicFadeMs);
  }

  renderVolumeControls(parentEl) {
    const volumeRow = parentEl.createEl('div', { cls: 'audio-sb-volume-row' });
    this._masterVolumeInput = this.createVolumeControl(volumeRow, 'Master', 'masterVolume');
    this._musicVolumeInput = this.createVolumeControl(volumeRow, 'Music', 'musicVolume');
    this._sfxVolumeInput = this.createVolumeControl(volumeRow, 'SFX', 'sfxVolume');
    this._loopVolumeInput = this.createVolumeControl(volumeRow, 'Loop', 'loopVolume');
  }

  createVolumeControl(parentEl, label, settingKey) {
    const wrap = parentEl.createEl('label', { cls: 'audio-sb-volume-control' });
    const headerRow = wrap.createEl('div', { cls: 'audio-sb-volume-header' });
    headerRow.createEl('span', { text: label, cls: 'audio-sb-volume-label' });
    const valueEl = headerRow.createEl('span', {
      text: `${this.plugin.settings[settingKey]}%`,
      cls: 'audio-sb-volume-value'
    });
    const input = wrap.createEl('input', {
      cls: 'audio-sb-volume-slider',
      type: 'range',
      attr: { min: '0', max: '100', step: '1' }
    });
    input.value = String(this.plugin.settings[settingKey]);
    // 'input' previews volume live while dragging; 'change' persists it.
    input.addEventListener('input', () => {
      const value = Number(input.value);
      valueEl.textContent = `${value}%`;
      this.plugin.previewVolumeSetting(settingKey, value);
    });
    input.addEventListener('change', async () => {
      await this.plugin.updateVolumeSetting(settingKey, Number(input.value));
    });
    return input;
  }

  renderTimeline(parentEl) {
    const row = parentEl.createEl('div', { cls: 'audio-sb-timeline' });
    this._timelineElapsed = row.createEl('span', { text: '0:00', cls: 'audio-sb-timeline-time' });
    this._timelineInput = row.createEl('input', {
      type: 'range',
      cls: 'audio-sb-timeline-slider',
      attr: { min: '0', max: '100', step: '0.1', 'aria-label': 'Seek current track' }
    });
    this._timelineInput.disabled = true;
    this._timelineInput.addEventListener('pointerdown', () => { this._timelineSeeking = true; });
    const finishSeeking = () => {
      this._timelineSeeking = false;
      this.updateTimeline();
    };
    this._timelineInput.addEventListener('pointerup', finishSeeking);
    this._timelineInput.addEventListener('pointercancel', finishSeeking);
    this._timelineInput.addEventListener('blur', finishSeeking);
    this._timelineInput.addEventListener('input', () => {
      const audio = this._currentAudio;
      if (!audio || !Number.isFinite(audio.duration) || audio.duration <= 0) return;
      audio.currentTime = Math.min(audio.duration, Number(this._timelineInput.value));
      this._timelineElapsed.textContent = this.formatTime(audio.currentTime);
    });
    this._timelineDuration = row.createEl('span', { text: '0:00', cls: 'audio-sb-timeline-time' });
    this._timelineRow = row;
  }

  updateTimeline() {
    if (!this._timelineInput) return;
    const audio = this._currentAudio;
    const duration = audio && Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : 0;
    this._timelineRow.toggleClass('audio-sb-hidden', !audio);
    this._timelineInput.disabled = duration === 0;
    this._timelineInput.max = String(duration || 100);
    if (!this._timelineSeeking) this._timelineInput.value = String(Math.min(audio?.currentTime || 0, duration || 100));
    this._timelineElapsed.textContent = this.formatTime(audio?.currentTime || 0);
    this._timelineDuration.textContent = this.formatTime(duration);
  }

  createPlayerPopover(parentEl, iconName, label) {
    const wrap = parentEl.createEl('div', { cls: 'audio-sb-control-wrap' });
    const button = wrap.createEl('button', {
      cls: 'audio-sb-control-btn', type: 'button',
      attr: { 'aria-label': label, 'aria-expanded': 'false', title: label }
    });
    setIcon(button, iconName);
    const popup = wrap.createEl('div', { cls: 'audio-sb-control-popup audio-sb-hidden' });
    button.onclick = () => {
      const opening = popup.classList.contains('audio-sb-hidden');
      this._footerEl.querySelectorAll('.audio-sb-control-popup').forEach(other => other.classList.add('audio-sb-hidden'));
      this._footerEl.querySelectorAll('.audio-sb-control-btn').forEach(other => other.setAttribute('aria-expanded', 'false'));
      popup.classList.toggle('audio-sb-hidden', !opening);
      button.setAttribute('aria-expanded', String(opening));
    };
    return popup;
  }

  renderGlobalVolume(parentEl) {
    const popup = this.createPlayerPopover(parentEl, 'volume-2', 'Volume');
    popup.createEl('span', { text: 'Volume', cls: 'audio-sb-control-label' });
    const input = popup.createEl('input', {
      cls: 'audio-sb-vertical-slider', type: 'range',
      attr: { min: '0', max: '100', step: '1', 'aria-label': 'Global volume' }
    });
    input.value = String(this.plugin.settings.masterVolume);
    const value = popup.createEl('span', {
      text: `${this.plugin.settings.masterVolume}%`, cls: 'audio-sb-global-volume-value'
    });
    input.addEventListener('input', () => {
      value.textContent = `${input.value}%`;
      this.plugin.previewVolumeSetting('masterVolume', Number(input.value));
    });
    input.addEventListener('change', () => this.plugin.updateVolumeSetting('masterVolume', Number(input.value)));
    this._masterVolumeInput = input;
  }

  renderPlaybackSpeed(parentEl) {
    const popup = this.createPlayerPopover(parentEl, 'gauge', 'Playback speed');
    popup.createEl('span', { text: 'Speed', cls: 'audio-sb-control-label' });
    const input = popup.createEl('input', {
      cls: 'audio-sb-vertical-slider', type: 'range',
      attr: { min: '0.5', max: '2', step: '0.05', 'aria-label': 'Playback speed' }
    });
    input.value = String(this.plugin.clampPlaybackRate(this.plugin.settings.playbackRate));
    const value = popup.createEl('span', { cls: 'audio-sb-speed-value' });
    const update = () => {
      const speed = this.plugin.clampPlaybackRate(input.value);
      value.textContent = `${speed.toFixed(2).replace(/0$/, '').replace(/\.0$/, '')}×`;
      this.plugin.settings.playbackRate = speed;
      this.getTrackAudios().forEach(audio => { audio.playbackRate = speed; });
    };
    input.addEventListener('input', update);
    input.addEventListener('change', () => this.plugin.saveSettings());
    update();
  }

  syncVolumeControls() {
    const controls = [
      [this._masterVolumeInput, this.plugin.settings.masterVolume],
      [this._musicVolumeInput, this.plugin.settings.musicVolume],
      [this._sfxVolumeInput, this.plugin.settings.sfxVolume],
      [this._loopVolumeInput, this.plugin.settings.loopVolume]
    ];

    for (const [input, value] of controls) {
      if (!input) continue;
      input.value = String(value);
      const valueEl = input.parentElement?.querySelector('.audio-sb-volume-value, .audio-sb-global-volume-value');
      if (valueEl) valueEl.textContent = `${value}%`;
    }
  }

  stopAllTracks(clearSelection = true) {
    this.getTrackAudios().forEach(audio => {
      this.clearFade(audio);
      audio.dataset.fadeLevel = '1';
      audio.pause();
      audio.currentTime = 0;
    });

    if (clearSelection) {
      this._currentAudio = null;
      this._currentTrackName = '';
    } else {
      this.syncCurrentAudio();
    }

    if (this._detachedAudios) this._detachedAudios.clear();

    this.updateNowPlaying();
  }

  fadeOutAllTracks(clearSelection = true) {
    const activeAudios = this.getTrackAudios().filter(audio => !audio.paused && !audio.ended);
    if (activeAudios.length === 0) {
      if (clearSelection) {
        this._currentAudio = null;
        this._currentTrackName = '';
      } else {
        this.syncCurrentAudio();
      }
      this.updateNowPlaying();
      return Promise.resolve();
    }

    return Promise.all(activeAudios.map(audio => this.fadeOutAndStop(audio))).then(() => {
      if (clearSelection) {
        this._currentAudio = null;
        this._currentTrackName = '';
      } else {
        this.syncCurrentAudio();
      }
      this.updateNowPlaying();
    });
  }

  // Determines the active track by picking the most recently started playing
  // audio. Used after overlap-policy enforcement to keep the footer accurate.
  syncCurrentAudio() {
    const playingAudios = this.getTrackAudios()
      .filter(audio => !audio.paused && !audio.ended)
      .sort((a, b) => Number(b.dataset.lastStarted || 0) - Number(a.dataset.lastStarted || 0));

    this._currentAudio = playingAudios[0] || null;
    this._currentTrackName = this._currentAudio?.dataset.trackName || '';
  }

  // When overlap is turned off, fades out every track except the most recent.
  applyMusicOverlapPolicy() {
    if (this.plugin.settings.allowMusicOverlap) return;

    this.syncCurrentAudio();
    const current = this._currentAudio;
    this.getTrackAudios().forEach(audio => {
      if (audio !== current) this.fadeOutAndStop(audio, { resetTime: false });
    });
    this.updateNowPlaying();
  }

  applyMusicVolume() {
    this.getTrackAudios().forEach(audio => {
      this.applyAudioVolume(audio);
    });
  }

  // Volume = effective master×category volume scaled by the current fade level
  // so that fades work independently of the volume sliders.
  applyAudioVolume(audio) {
    if (!audio) return;
    const fadeLevel = Number(audio.dataset.fadeLevel || 1);
    audio.volume = this.plugin.getEffectiveVolume('music') * fadeLevel;
  }

  clearFade(audio) {
    if (!audio) return;
    if (audio._audioSbFadeInterval) {
      window.clearInterval(audio._audioSbFadeInterval);
      audio._audioSbFadeInterval = null;
    }
  }

  setFadeLevel(audio, fadeLevel) {
    const clamped = Math.max(0, Math.min(1, fadeLevel));
    audio.dataset.fadeLevel = String(clamped);
    this.applyAudioVolume(audio);
  }

  // Animates volume between the current fade level and targetLevel over
  // durationMs using a 50 ms tick interval. Resolves when the fade completes.
  startFade(audio, targetLevel, durationMs, options = {}) {
    if (!audio) return Promise.resolve();

    const duration = this.plugin.clampFadeMs(durationMs);
    const target = Math.max(0, Math.min(1, targetLevel));
    const startLevel = Number(audio.dataset.fadeLevel || 1);
    this.clearFade(audio);

    if (duration <= 0 || Math.abs(startLevel - target) < 0.01) {
      this.setFadeLevel(audio, target);
      if (options.pauseOnComplete) {
        // Suppress the pause event so it doesn't incorrectly clear _currentAudio.
        this._suppressPauseSync = true;
        audio.pause();
        this._suppressPauseSync = false;
      }
      if (options.resetTime) audio.currentTime = 0;
      return Promise.resolve();
    }

    return new Promise(resolve => {
      const startedAt = Date.now();
      audio._audioSbFadeInterval = window.setInterval(() => {
        const elapsed = Date.now() - startedAt;
        const progress = Math.min(elapsed / duration, 1);
        const nextLevel = startLevel + ((target - startLevel) * progress);
        this.setFadeLevel(audio, nextLevel);

        if (progress >= 1) {
          this.clearFade(audio);
          if (options.pauseOnComplete) {
            this._suppressPauseSync = true;
            audio.pause();
            this._suppressPauseSync = false;
          }
          if (options.resetTime) audio.currentTime = 0;
          resolve();
        }
      }, 50);
    });
  }

  // Sets fadeLevel to 0 before play() so handleTrackPlay can fade in from
  // silence. The pendingFadeIn flag signals handleTrackPlay to run the fade.
  async fadeInTrack(audio) {
    if (!audio) return;
    audio.dataset.pendingFadeIn = '1';
    try {
      await audio.play();
    } catch (error) {
      delete audio.dataset.pendingFadeIn;
      this.setFadeLevel(audio, 1);
      throw error;
    }
  }

  fadeOutAndStop(audio, options = {}) {
    if (!audio || audio.ended) return Promise.resolve();
    const preserveSelection = options.preserveSelection === true;
    if (audio.paused) {
      if (options.resetTime !== false) audio.currentTime = 0;
      if (!preserveSelection && this._currentAudio === audio) {
        this._currentAudio = null;
        this._currentTrackName = '';
      }
      this.updateNowPlaying();
      return Promise.resolve();
    }
    return this.startFade(audio, 0, this.getFadeDurationMs(), {
      pauseOnComplete: true,
      resetTime: options.resetTime !== false
    }).then(() => {
      // Restore fade level so the next play starts at full volume.
      this.setFadeLevel(audio, 1);
      this.applyAudioVolume(audio);
      if (!preserveSelection && this._currentAudio === audio) {
        this.syncCurrentAudio();
      }
      // Always refresh now playing — the faded track must leave the list even
      // when _currentAudio has already moved to a newer track.
      this.updateNowPlaying();
    });
  }

  // Called by the 'play' event on every track audio element.
  // Handles crossfading out other tracks and fading the new one in.
  handleTrackPlay(audio, trackName) {
    audio.dataset.lastStarted = String(Date.now());
    const visibleQueue = this.getVisibleQueue();
    if (visibleQueue.includes(audio.dataset.trackPath)) this._playQueuePaths = visibleQueue;
    const otherPlayingAudios = this.getTrackAudios().filter(a => a !== audio && !a.paused && !a.ended);

    if (!this.plugin.settings.allowMusicOverlap) {
      otherPlayingAudios.forEach(other => {
        this.fadeOutAndStop(other, { resetTime: false });
      });
    }

    if (this.getFadeDurationMs() > 0) {
      this.setFadeLevel(audio, 0);
      this.startFade(audio, 1, this.getFadeDurationMs());
    } else {
      this.setFadeLevel(audio, 1);
    }
    delete audio.dataset.pendingFadeIn;

    this._currentAudio = audio;
    this._currentTrackName = trackName;
    this.updateNowPlaying();
  }

  loadFolder(folder) {
    this._loadedFolder = folder;
    // Keep the currently playing element alive when the user browses to a
    // different folder. Removing an <audio> node from the sidebar does not
    // stop it while we retain a reference to it.
    const current = this._currentAudio;
    if (current && !current.ended) {
      if (!this._detachedAudios) this._detachedAudios = new Set();
      this._detachedAudios.add(current);
      if (this._persistentAudioEl) this._persistentAudioEl.appendChild(current);
    } else {
      this.stopAllTracks();
    }
    this._bodyEl.empty();
    this.renderTracks(this._bodyEl, folder);
    this.updateNowPlaying();
  }

  renderTracks(content, folder) {
    const audioFiles = this.plugin.findAudioInFolder(folder);

    const header = content.createEl('div', { cls: 'audio-sb-header' });
    header.createEl('span', { text: folder.name || 'Root', cls: 'audio-sb-folder-name' });
    this._countEl = header.createEl('span', { text: `${audioFiles.length} track${audioFiles.length !== 1 ? 's' : ''}`, cls: 'audio-sb-count' });
    const headerActions = header.createEl('div', { cls: 'audio-sb-header-actions' });
    const refreshBtn = headerActions.createEl('button', {
      cls: 'audio-sb-cog-btn',
      type: 'button',
      attr: { 'aria-label': 'Refresh current folder', title: 'Refresh current folder' }
    });
    setIcon(refreshBtn, 'refresh-cw');
    refreshBtn.onclick = () => {
      this.loadFolder(folder);
      new Notice(`${folder.name || 'Audio'} refreshed`);
    };
    const settingsBtn = headerActions.createEl('button', {
      cls: 'audio-sb-cog-btn',
      type: 'button',
      attr: { 'aria-label': 'Audio Sidebar settings', title: 'Settings' }
    });
    setIcon(settingsBtn, 'settings');
    settingsBtn.onclick = () => {
      this.plugin.app.setting.open();
      this.plugin.app.setting.openTabById('cherrynik-audio-sidebar');
    };
    this._continueBtn = null;
    this._overlapBtn = null;

    const searchWrap = content.createEl('div', { cls: 'audio-sb-search-wrap' });
    const searchEl = searchWrap.createEl('input', { cls: 'audio-sb-search', type: 'text' });
    searchEl.placeholder = 'Search tracks…';
    searchEl.addEventListener('input', () => this.filterTracks(searchEl.value));

    if (audioFiles.length === 0) {
      content.createEl('div', { text: `No audio files in ${folder.name || 'root'}.`, cls: 'audio-sb-empty' });
      return;
    }

    this._trackList = content.createEl('div', { cls: 'audio-sb-list' });

    for (const af of audioFiles) {
      const item = this._trackList.createEl('div', { cls: 'audio-sb-item' });
      item.dataset.name = af.basename.toLowerCase();
      item.dataset.trackPath = af.path;

      const playBtn = item.createEl('button', {
        cls: 'audio-sb-track-play',
        type: 'button',
        attr: { 'aria-label': `Play ${af.basename}`, title: 'Play' }
      });
      setIcon(playBtn, 'play');
      item.createEl('div', { text: af.basename, cls: 'audio-sb-track-name' });
      const durationEl = item.createEl('span', { text: '', cls: 'audio-sb-track-duration' });
      const audio = item.createEl('audio', { cls: 'audio-sb-track-audio' });
      audio._audioSbItem = item;
      audio._audioSbPlayBtn = playBtn;
      audio._audioSbDurationEl = durationEl;
      this.configureTrackAudio(audio, af);
      playBtn.onclick = () => {
        if (audio === this._currentAudio && !audio.paused) {
          this.fadeOutAndStop(audio, { resetTime: false, preserveSelection: true });
        }
        else this.fadeInTrack(audio).catch(() => new Notice(`Could not play ${af.basename}`));
      };
    }
    this.updateTrackListState();
  }

  configureTrackAudio(audio, af) {
      audio.controls = true;
      audio.loop = false;
      audio.playbackRate = this.plugin.clampPlaybackRate(this.plugin.settings.playbackRate);
      audio.src = this.app.vault.getResourcePath(af);
      audio.dataset.fadeLevel = '1';
      audio.dataset.trackName = af.basename;
      audio.dataset.trackPath = af.path;
      this.applyAudioVolume(audio);
      audio.addEventListener('play', () => {
        this.handleTrackPlay(audio, af.basename);
      });
      audio.addEventListener('loadedmetadata', () => {
        if (audio._audioSbDurationEl) audio._audioSbDurationEl.textContent = this.formatDuration(audio.duration);
        if (this._currentAudio === audio) this.updateNowPlaying();
      });
      audio.addEventListener('durationchange', () => {
        if (this._currentAudio === audio) this.updateNowPlaying();
      });
      audio.addEventListener('pause', () => {
        // Pausing keeps the current track, position, and queue available.
        if (this._suppressPauseSync) return;
        if (this._detachedAudios?.has(audio) && this._currentAudio !== audio) {
          this._detachedAudios.delete(audio);
          audio.remove();
        }
        if (this._currentAudio === audio) {
          this.updateNowPlaying();
        }
      });
      audio.addEventListener('ended', () => {
        if (this._currentAudio === audio) {
          if (this._looping) {
            audio.currentTime = 0;
            this.fadeInTrack(audio).catch(() => new Notice(`Could not repeat ${af.basename}`));
          } else if (this.plugin.settings.continuePlayback) {
            this.playNextTrack(audio);
          } else {
            this.syncCurrentAudio();
          }
          this.updateNowPlaying();
        }
      });
  }

  updateNowPlaying() {
    if (!this._nowPlayingListEl) return;
    this._nowPlayingListEl.empty();
    this._npTimeEls = new Map();

    const currentMusic = this._currentAudio && !this._currentAudio.ended ? this._currentAudio : null;
    const playingLoops = Array.from(this.plugin._activeLoops.values());
    const playingSfx = Array.from(this.plugin._activeSfx).filter(a => !a.ended);

    if (!currentMusic && playingLoops.length === 0 && playingSfx.length === 0) {
      this._nowPlayingListEl.createEl('div', { text: 'Nothing playing', cls: 'audio-sb-np-empty' });
    } else {
      if (currentMusic) this._addNowPlayingRow(currentMusic, 'music', currentMusic.dataset.trackName || '?');
      for (const audio of playingLoops) {
        this._addNowPlayingRow(audio, 'loop', audio.dataset.loopName || '?');
      }
      for (const audio of playingSfx) {
        this._addNowPlayingRow(audio, 'sfx', audio.dataset.sfxName || '?');
      }
    }
    this.renderUpNext(currentMusic);
    this.updateTimeline();
    this.updateTrackListState();
  }

  renderUpNext(currentAudio) {
    if (!this._upNextListEl || !this._upNextLabelEl) return;
    this._upNextListEl.empty();
    const queue = this._playQueuePaths?.length ? this._playQueuePaths : this.getVisibleQueue();
    const currentPath = currentAudio?.dataset.trackPath;
    const currentIndex = currentPath ? queue.indexOf(currentPath) : -1;
    const upcoming = currentIndex >= 0 ? queue.slice(currentIndex + 1) : [];
    this._upNextLabelEl.toggleClass('audio-sb-hidden', upcoming.length === 0);
    this._upNextListEl.toggleClass('audio-sb-hidden', upcoming.length === 0);
    for (const path of upcoming) {
      const file = this.app.vault.getAbstractFileByPath(path);
      if (!(file instanceof TFile)) continue;
      const row = this._upNextListEl.createEl('button', { cls: 'audio-sb-up-next-item', type: 'button' });
      const icon = row.createEl('span', { cls: 'audio-sb-up-next-icon' });
      setIcon(icon, 'play');
      row.createEl('span', { text: file.basename, cls: 'audio-sb-up-next-name' });
      row.onclick = () => {
        let audio = this.getTrackAudios().find(candidate => candidate.dataset.trackPath === path);
        if (!audio) audio = this.createDetachedTrack(path);
        if (!audio) return;
        audio.currentTime = 0;
        this.fadeInTrack(audio).catch(() => new Notice(`Could not play ${file.basename}`));
      };
    }
  }

  updateTrackListState() {
    if (!this._trackList) return;
    const currentPath = this._currentAudio?.dataset.trackPath;
    this._trackList.querySelectorAll('.audio-sb-item').forEach(item => {
      const active = item.dataset.trackPath === currentPath;
      item.toggleClass('audio-sb-item-active', active);
      const button = item.querySelector('.audio-sb-track-play');
      if (!button) return;
      button.empty();
      const playing = active && this._currentAudio && !this._currentAudio.paused;
      setIcon(button, playing ? 'pause' : 'play');
      button.setAttribute('aria-label', `${playing ? 'Pause' : 'Play'} ${item.querySelector('.audio-sb-track-name')?.textContent || 'track'}`);
      button.title = playing ? 'Pause' : 'Play';
    });
  }

  _addNowPlayingRow(audio, type, name) {
    const row = this._nowPlayingListEl.createEl('div', { cls: `audio-sb-np-row audio-sb-np-${type}` });

    const timeEl = row.createEl('span', {
      text: this.formatTime(audio.currentTime),
      cls: 'audio-sb-np-time'
    });
    this._npTimeEls.set(audio, timeEl);

    row.createEl('span', { text: name, cls: 'audio-sb-np-name' });

    const controls = row.createEl('div', { cls: 'audio-sb-np-controls' });

    if (type === 'music') {
      const previousBtn = controls.createEl('button', {
        cls: 'audio-sb-np-btn',
        type: 'button',
        attr: { 'aria-label': 'Previous track', title: 'Previous track' }
      });
      setIcon(previousBtn, 'skip-back');
      previousBtn.onclick = () => this.playRelativeTrack(audio, -1);
    }

    if (type !== 'sfx') {
      const isPlaying = !audio.paused;
      const playBtn = controls.createEl('button', {
        cls: 'audio-sb-np-btn',
        type: 'button',
        attr: { 'aria-label': isPlaying ? 'Pause' : 'Play' }
      });
      setIcon(playBtn, isPlaying ? 'pause' : 'play');
      playBtn.onclick = () => {
        if (type === 'music') {
          if (audio.paused) this.fadeInTrack(audio).catch(() => {});
          else this.fadeOutAndStop(audio, { resetTime: false, preserveSelection: true });
        } else {
          if (audio.paused) audio.play().catch(() => {});
          else audio.pause();
        }
        this.updateNowPlaying();
      };
    }

    if (type === 'music') {
      const nextBtn = controls.createEl('button', {
        cls: 'audio-sb-np-btn',
        type: 'button',
        attr: { 'aria-label': 'Next track', title: 'Next track' }
      });
      setIcon(nextBtn, 'skip-forward');
      nextBtn.onclick = () => this.playRelativeTrack(audio, 1);
    }

    const stopBtn = controls.createEl('button', {
      cls: 'audio-sb-np-btn',
      type: 'button',
      attr: { 'aria-label': 'Stop' }
    });
    setIcon(stopBtn, 'square');
    stopBtn.onclick = () => {
      if (type === 'music') {
        this.fadeOutAndStop(audio);
      } else if (type === 'loop') {
        const path = audio.dataset.loopPath;
        if (path) this.plugin.stopLoopByPath(path);
      } else {
        this.plugin.fadeSfxOut(audio);
      }
    };
  }

  _refreshNowPlayingTimes() {
    if (!this._npTimeEls) return;
    for (const [audio, timeEl] of this._npTimeEls) {
      timeEl.textContent = this.formatTime(audio.currentTime);
    }
    this.updateTimeline();
  }

  formatTime(seconds) {
    if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
    const total = Math.floor(seconds);
    return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
  }

  formatDuration(durationSeconds) {
    if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) return '';
    const totalSeconds = Math.round(durationSeconds);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${String(seconds).padStart(2, '0')}`;
  }

  toggleCurrentTrack() {
    if (!this._currentAudio) return;
    if (this._currentAudio.paused || this._currentAudio.ended) {
      if (this._currentAudio.ended) this._currentAudio.currentTime = 0;
      this.fadeInTrack(this._currentAudio).catch(() => {
        new Notice(`Could not play ${this._currentTrackName || 'track'}`);
      });
      return;
    }
    this.fadeOutAndStop(this._currentAudio, { resetTime: false, preserveSelection: true });
  }

  stopCurrentTrack(clearSelection = true) {
    if (!this._currentAudio) return;
    const audio = this._currentAudio;
    this.fadeOutAndStop(audio).then(() => {
      if (clearSelection) {
        this.syncCurrentAudio();
      }
      this.updateNowPlaying();
    });
  }

  filterTracks(query) {
    if (!this._trackList) return;
    const q = query.toLowerCase().trim();
    let visible = 0;
    this._trackList.querySelectorAll('.audio-sb-item').forEach(item => {
      const match = !q || item.dataset.name.includes(q);
      item.toggleClass('audio-sb-hidden', !match);
      if (match) visible++;
    });
    if (this._countEl) {
      this._countEl.textContent = `${visible} track${visible !== 1 ? 's' : ''}`;
    }
  }

  // Finds a track by partial name match and starts playing it. Used by the
  // audiosidebar codeblock processor to auto-play after loading a folder.
  playTrack(trackName) {
    if (!this._trackList) return;
    const items = this._trackList.querySelectorAll('.audio-sb-item');
    for (const item of items) {
      if (item.dataset.name.includes(trackName)) {
        const audio = item.querySelector('audio');
        if (audio) {
          audio.currentTime = 0;
          this.fadeInTrack(audio).catch(() => {
            new Notice(`Could not play ${audio.dataset.trackName || 'track'}`);
          });
        }
        break;
      }
    }
  }

  async onClose() {
    if (this._nowPlayingTimer) {
      window.clearInterval(this._nowPlayingTimer);
      this._nowPlayingTimer = null;
    }
    this.stopAllTracks();
  }
}

// ─── Settings Tab ─────────────────────────────────────────────────────────────

class AudioSidebarSettingTab extends PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display() {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl)
      .setName('Default folder')
      .setDesc('Vault-relative folder path to load automatically when the sidebar opens.')
      .addText(text => {
        text
          .setPlaceholder('Music/Ambient')
          .setValue(this.plugin.settings.defaultFolderPath)
          .onChange(async (value) => {
            this.plugin.settings.defaultFolderPath = value.trim();
            await this.plugin.saveSettings();
            // Load immediately if the typed path already resolves to a folder,
            // so the sidebar updates without needing a restart.
            const folder = this.plugin.getDefaultFolder();
            if (folder) await this.plugin.loadFolderIntoLeaves(folder);
          });
        text.inputEl.addClass('audio-sb-settings-input');
      });

    new Setting(containerEl)
      .setName('Use selected folder')
      .setDesc('Copy the folder currently selected in the file explorer into the default folder setting.')
      .addButton(button => button
        .setButtonText('Use current selection')
        .onClick(async () => {
          const folder = this.plugin.selectedFolder;
          if (!(folder instanceof TFolder)) {
            new Notice('Select a folder in the file explorer first.');
            return;
          }

          this.plugin.settings.defaultFolderPath = folder.path;
          await this.plugin.saveSettings();
          await this.plugin.loadDefaultFolderIntoView();
          this.display();
          new Notice(`Default folder set to ${folder.path}`);
        }));

    new Setting(containerEl)
      .setName('Sound effects folder')
      .setDesc('Vault-relative folder path used by the searchable one-shot SFX picker.')
      .addText(text => {
        text
          .setPlaceholder('SFX')
          .setValue(this.plugin.settings.sfxFolderPath)
          .onChange(async (value) => {
            this.plugin.settings.sfxFolderPath = value.trim();
            await this.plugin.saveSettings();
          });
        text.inputEl.addClass('audio-sb-settings-input');
      });

    new Setting(containerEl)
      .setName('Loops folder')
      .setDesc('Vault-relative folder path used by the looping ambient sound picker.')
      .addText(text => {
        text
          .setPlaceholder('Loops')
          .setValue(this.plugin.settings.loopFolderPath)
          .onChange(async (value) => {
            this.plugin.settings.loopFolderPath = value.trim();
            await this.plugin.saveSettings();
          });
        text.inputEl.addClass('audio-sb-settings-input');
      });

    new Setting(containerEl)
      .setName('Play next automatically')
      .setDesc('Play the next track when the current one ends. Folder navigation never stops the current track.')
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.continuePlayback)
        .onChange(async (value) => {
          this.plugin.settings.continuePlayback = value;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName('Allow music overlap')
      .setDesc('Let multiple music tracks play at once so you can transition between them manually.')
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.allowMusicOverlap)
        .onChange(async (value) => {
          this.plugin.settings.allowMusicOverlap = value;
          await this.plugin.saveSettings();
          this.plugin.refreshAllViews();
        }));

    new Setting(containerEl)
      .setName('Master volume')
      .setDesc('Overall volume applied to music, sound effects, and loops.')
      .addSlider(slider => slider
        .setLimits(0, 100, 1)
        .setValue(this.plugin.settings.masterVolume)
        .setDynamicTooltip()
        .onChange(async (value) => {
          await this.plugin.updateVolumeSetting('masterVolume', value);
        }));

    new Setting(containerEl)
      .setName('Music volume')
      .setDesc('Category volume for tracks played in the audio sidebar.')
      .addSlider(slider => slider
        .setLimits(0, 100, 1)
        .setValue(this.plugin.settings.musicVolume)
        .setDynamicTooltip()
        .onChange(async (value) => {
          await this.plugin.updateVolumeSetting('musicVolume', value);
        }));

    new Setting(containerEl)
      .setName('Sound effects volume')
      .setDesc('Category volume for one-shot effects from the picker and embeds.')
      .addSlider(slider => slider
        .setLimits(0, 100, 1)
        .setValue(this.plugin.settings.sfxVolume)
        .setDynamicTooltip()
        .onChange(async (value) => {
          await this.plugin.updateVolumeSetting('sfxVolume', value);
        }));

    new Setting(containerEl)
      .setName('Loop volume')
      .setDesc('Category volume for looping ambient sound effects.')
      .addSlider(slider => slider
        .setLimits(0, 100, 1)
        .setValue(this.plugin.settings.loopVolume)
        .setDynamicTooltip()
        .onChange(async (value) => {
          await this.plugin.updateVolumeSetting('loopVolume', value);
        }));

    new Setting(containerEl)
      .setName('Music fade duration')
      .setDesc('Fade in and fade out duration in milliseconds. Used for manual stops and automatic crossfades.')
      .addSlider(slider => slider
        .setLimits(0, 5000, 100)
        .setValue(this.plugin.settings.musicFadeMs)
        .setDynamicTooltip()
        .onChange(async (value) => {
          await this.plugin.updateFadeSetting(value);
        }));

    const footerEl = containerEl.createEl('div', { cls: 'audio-sb-settings-footer' });
    footerEl.createEl('span', { text: 'Made by Patriek Jeuriens' });
    footerEl.createEl('a', {
      text: 'View on Obsidian Community',
      href: 'https://github.com/cherrynik/obsidian-audio-sidebar',
      attr: { target: '_blank', rel: 'noopener noreferrer' },
    });
  }
}

// ─── Plugin ───────────────────────────────────────────────────────────────────

class AudioSidebarPlugin extends Plugin {
  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  clampVolume(value) {
    return Math.max(0, Math.min(100, Number(value) || 0));
  }

  clampFadeMs(value) {
    return Math.max(0, Math.min(5000, Number(value) || 0));
  }

  clampPlaybackRate(value) {
    return Math.max(0.5, Math.min(2, Number(value) || 1));
  }

  // Returns a 0–1 multiplier combining master and category volumes.
  getEffectiveVolume(category) {
    const master = this.clampVolume(this.settings.masterVolume) / 100;
    let categoryValue;
    if (category === 'sfx') categoryValue = this.settings.sfxVolume;
    else if (category === 'loop') categoryValue = this.settings.loopVolume;
    else categoryValue = this.settings.musicVolume;
    return master * (this.clampVolume(categoryValue) / 100);
  }

  // Updates the in-memory setting and refreshes all live audio without saving,
  // so the slider feels responsive while dragging.
  previewVolumeSetting(key, value) {
    this.settings[key] = this.clampVolume(value);
    this.refreshAllViews();
    this.refreshActiveSfxVolumes();
    this.refreshActiveLoopVolumes();
  }

  async updateVolumeSetting(key, value) {
    this.previewVolumeSetting(key, value);
    await this.saveSettings();
  }

  async updateFadeSetting(value) {
    this.settings.musicFadeMs = this.clampFadeMs(value);
    await this.saveSettings();
  }

  getFolderByPath(path) {
    if (!path) return null;
    const target = this.app.vault.getAbstractFileByPath(normalizePath(path));
    return target instanceof TFolder ? target : null;
  }

  getDefaultFolder() {
    return this.getFolderByPath(this.settings.defaultFolderPath);
  }

  getSfxFolder() {
    return this.getFolderByPath(this.settings.sfxFolderPath);
  }

  getLoopFolder() {
    return this.getFolderByPath(this.settings.loopFolderPath);
  }

  getAudioFileByPath(path) {
    if (!path) return null;
    const target = this.app.vault.getAbstractFileByPath(normalizePath(path));
    if (!(target instanceof TFile)) return null;
    return AUDIO_EXTENSIONS.includes(target.extension.toLowerCase()) ? target : null;
  }

  // Resolves a codeblock source string to an audio TFile using three strategies
  // in order: exact vault path → folder#basename syntax → basename search in
  // the configured SFX folder.
  resolveSfxFile(source) {
    const normalized = source.trim();
    if (!normalized) return null;

    const directFile = this.getAudioFileByPath(normalized);
    if (directFile) return directFile;

    // Support folder#filename syntax to pick a file from a specific folder.
    const hashIdx = normalized.indexOf('#');
    if (hashIdx !== -1) {
      const folderPath = normalized.slice(0, hashIdx).trim();
      const filename = normalized.slice(hashIdx + 1).trim();
      const folder = this.getFolderByPath(folderPath);
      if (folder && filename) {
        const lookup = filename.toLowerCase();
        const found = this.findAudioInFolder(folder).find(file =>
          file.basename.toLowerCase() === lookup ||
          `${file.basename}.${file.extension}`.toLowerCase() === lookup
        );
        if (found) return found;
      }
    }

    const sfxFolder = this.getSfxFolder();
    if (!sfxFolder) return null;

    const lookup = normalized.toLowerCase();
    return this.findAudioInFolder(sfxFolder).find(file =>
      file.basename.toLowerCase() === lookup ||
      `${file.basename}.${file.extension}`.toLowerCase() === lookup
    ) || null;
  }

  // Same resolution logic as resolveSfxFile but falls back to the loop folder.
  resolveLoopFile(source) {
    const normalized = source.trim();
    if (!normalized) return null;

    const directFile = this.getAudioFileByPath(normalized);
    if (directFile) return directFile;

    const hashIdx = normalized.indexOf('#');
    if (hashIdx !== -1) {
      const folderPath = normalized.slice(0, hashIdx).trim();
      const filename = normalized.slice(hashIdx + 1).trim();
      const folder = this.getFolderByPath(folderPath);
      if (folder && filename) {
        const lookup = filename.toLowerCase();
        const found = this.findAudioInFolder(folder).find(file =>
          file.basename.toLowerCase() === lookup ||
          `${file.basename}.${file.extension}`.toLowerCase() === lookup
        );
        if (found) return found;
      }
    }

    const loopFolder = this.getLoopFolder();
    if (!loopFolder) return null;

    const lookup = normalized.toLowerCase();
    return this.findAudioInFolder(loopFolder).find(file =>
      file.basename.toLowerCase() === lookup ||
      `${file.basename}.${file.extension}`.toLowerCase() === lookup
    ) || null;
  }

  findAudioInFolder(folder) {
    const files = [];
    const visit = current => {
      for (const child of current.children) {
        if (child instanceof TFolder) visit(child);
        else if (child instanceof TFile && AUDIO_EXTENSIONS.includes(child.extension.toLowerCase())) files.push(child);
      }
    };
    visit(folder);
    return files.sort((a, b) => a.basename.localeCompare(b.basename));
  }

  normalizeResourceUrl(source) {
    if (!source) return '';
    try {
      const url = new URL(source, window.location.href);
      url.hash = '';
      url.search = '';
      return decodeURIComponent(url.href);
    } catch (_) {
      return source;
    }
  }

  resolveNativeAudioFile(audio) {
    const source = this.normalizeResourceUrl(audio.currentSrc || audio.src || audio.getAttribute('src'));
    if (!source) return null;
    return this.app.vault.getFiles().find(file =>
      AUDIO_EXTENSIONS.includes(file.extension.toLowerCase()) &&
      this.normalizeResourceUrl(this.app.vault.getResourcePath(file)) === source
    ) || null;
  }

  async playFileInSidebar(file, startTime = 0) {
    await this.activateView();
    const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE);
    const view = leaves.map(leaf => leaf.view).find(candidate => candidate instanceof AudioSidebarView);
    if (!view) throw new Error('Audio Sidebar is unavailable');
    await view.playExternalFile(file, startTime);
  }

  handleNativeAudioPlay(event) {
    const audio = event.target;
    if (!(audio instanceof HTMLAudioElement)) return;
    if (audio.dataset.trackPath || audio.closest('.audio-sb-view')) return;
    const file = this.resolveNativeAudioFile(audio);
    if (!file) return;

    const startTime = Number.isFinite(audio.currentTime) ? audio.currentTime : 0;
    audio.pause();
    this.playFileInSidebar(file, startTime).catch(error => {
      audio.currentTime = startTime;
      audio.play().catch(() => {});
      new Notice(`Could not move ${file.basename} to Now Playing: ${error?.message || error}`);
    });
  }

  openSfxPicker() {
    const folder = this.getSfxFolder();
    if (!folder) {
      if (this.settings.sfxFolderPath) {
        new Notice(`Audio Sidebar SFX folder not found: ${this.settings.sfxFolderPath}`);
      } else {
        new Notice('Set an SFX folder in Audio Sidebar settings first.');
      }
      return;
    }

    const files = this.findAudioInFolder(folder);
    if (files.length === 0) {
      new Notice(`No audio files found in ${folder.path}`);
      return;
    }

    new AudioSfxModal(this.app, this, files).open();
  }

  openLoopPicker() {
    const folder = this.getLoopFolder();
    if (!folder) {
      if (this.settings.loopFolderPath) {
        new Notice(`Audio Sidebar loop folder not found: ${this.settings.loopFolderPath}`);
      } else {
        new Notice('Set a loop folder in Audio Sidebar settings first.');
      }
      return;
    }

    const files = this.findAudioInFolder(folder);
    if (files.length === 0) {
      new Notice(`No audio files found in ${folder.path}`);
      return;
    }

    new AudioLoopModal(this.app, this, files).open();
  }

  openSceneCreator() {
    new CreateSceneModal(this.app, this).open();
  }

  // Creates a detached Audio element so SFX plays independently of the
  // sidebar track list. Active instances are tracked in _activeSfx so they
  // can be stopped and have their volume updated as a group.
  playSfx(file) {
    const audio = new Audio(this.app.vault.getResourcePath(file));
    audio.loop = false;
    audio.volume = this.getEffectiveVolume('sfx');
    audio.dataset.sfxName = file.basename;
    audio.addEventListener('ended', () => {
      this._activeSfx.delete(audio);
      this.refreshNowPlaying();
    });
    audio.addEventListener('pause', () => {
      if (audio.ended) this._activeSfx.delete(audio);
    });
    this._activeSfx.add(audio);
    audio.play().catch(() => {
      this._activeSfx.delete(audio);
      new Notice(`Could not play ${file.basename}`);
    });
    this.refreshNowPlaying();
  }

  fadeSfxOut(audio, durationMs = 500) {
    if (!audio || audio.paused || audio.ended) return;
    const startVolume = audio.volume;
    const interval = 50;
    const steps = Math.max(1, Math.round(durationMs / interval));
    let step = 0;
    const id = window.setInterval(() => {
      step++;
      audio.volume = Math.max(0, startVolume * (1 - step / steps));
      if (step >= steps) {
        window.clearInterval(id);
        audio.pause();
        audio.currentTime = 0;
        this._activeSfx.delete(audio);
        this.refreshNowPlaying();
      }
    }, interval);
  }

  stopAllSfx() {
    this._activeSfx.forEach(audio => {
      audio.pause();
      audio.currentTime = 0;
    });
    this._activeSfx.clear();
    this.refreshNowPlaying();
  }

  refreshActiveSfxVolumes() {
    const volume = this.getEffectiveVolume('sfx');
    this._activeSfx.forEach(audio => {
      audio.volume = volume;
    });
  }

  // Starts a looping Audio element for the given file. Keyed by file.path so
  // the same loop can't be started twice, and can be stopped individually.
  playLoop(file) {
    if (this._activeLoops.has(file.path)) return;
    const audio = new Audio(this.app.vault.getResourcePath(file));
    audio.loop = true;
    audio.volume = 0;
    audio.dataset.loopFadeLevel = '0';
    audio.dataset.loopName = file.basename;
    audio.dataset.loopPath = file.path;
    audio.addEventListener('ended', () => {
      this._activeLoops.delete(file.path);
      this.refreshNowPlaying();
    });
    this._activeLoops.set(file.path, audio);
    audio.play().then(() => {
      this._startLoopFade(audio, 1, this.settings.musicFadeMs);
    }).catch(() => {
      this._activeLoops.delete(file.path);
      new Notice(`Could not play ${file.basename}`);
      this.refreshNowPlaying();
    });
    this.refreshNowPlaying();
  }

  stopLoop(file) {
    this.stopLoopByPath(file.path);
  }

  stopLoopByPath(path) {
    const audio = this._activeLoops.get(path);
    if (!audio) return;
    this._activeLoops.delete(path);
    this.refreshNowPlaying();
    this._startLoopFade(audio, 0, this.settings.musicFadeMs).then(() => {
      audio.pause();
      audio.currentTime = 0;
      audio.dataset.loopFadeLevel = '1';
    });
  }

  stopAllLoops() {
    const audios = Array.from(this._activeLoops.values());
    this._activeLoops.clear();
    this.refreshNowPlaying();
    for (const audio of audios) {
      this._startLoopFade(audio, 0, this.settings.musicFadeMs).then(() => {
        audio.pause();
        audio.currentTime = 0;
      });
    }
  }

  _applyLoopVolume(audio) {
    const fadeLevel = Number(audio.dataset.loopFadeLevel || 1);
    audio.volume = this.getEffectiveVolume('loop') * fadeLevel;
  }

  _startLoopFade(audio, targetFadeLevel, durationMs) {
    return new Promise(resolve => {
      if (audio._loopFadeInterval) {
        window.clearInterval(audio._loopFadeInterval);
        audio._loopFadeInterval = null;
      }
      const duration = this.clampFadeMs(durationMs);
      const startLevel = Number(audio.dataset.loopFadeLevel || 1);
      const target = Math.max(0, Math.min(1, targetFadeLevel));

      if (duration <= 0 || Math.abs(startLevel - target) < 0.01) {
        audio.dataset.loopFadeLevel = String(target);
        this._applyLoopVolume(audio);
        resolve();
        return;
      }

      const startedAt = Date.now();
      audio._loopFadeInterval = window.setInterval(() => {
        const elapsed = Date.now() - startedAt;
        const progress = Math.min(elapsed / duration, 1);
        audio.dataset.loopFadeLevel = String(startLevel + (target - startLevel) * progress);
        this._applyLoopVolume(audio);
        if (progress >= 1) {
          window.clearInterval(audio._loopFadeInterval);
          audio._loopFadeInterval = null;
          resolve();
        }
      }, 50);
    });
  }

  refreshActiveLoopVolumes() {
    this._activeLoops.forEach(audio => this._applyLoopVolume(audio));
  }

  async loadFolderIntoLeaves(folder) {
    const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE);
    const alreadyLoaded = leaves.some(leaf => leaf.view instanceof AudioSidebarView && leaf.view._loadedFolder?.path === folder.path);
    if (this.selectedFolder?.path === folder.path && alreadyLoaded) return;
    this.selectedFolder = folder;
    await this.activateView();
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE)) {
      if (leaf.view instanceof AudioSidebarView) {
        leaf.view.loadFolder(folder);
      }
    }
  }

  refreshNowPlaying() {
    const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE);
    for (const leaf of leaves) {
      if (leaf.view instanceof AudioSidebarView) {
        leaf.view.updateNowPlaying();
      }
    }
  }

  refreshAllViews() {
    const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE);
    for (const leaf of leaves) {
      if (leaf.view instanceof AudioSidebarView) {
        leaf.view.applyMusicOverlapPolicy();
        leaf.view.applyMusicVolume();
        leaf.view.syncVolumeControls();
        leaf.view.updateOverlapButton();
      }
    }
  }

  fadeOutAllAudio() {
    const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE);
    const trackFadePromises = [];

    for (const leaf of leaves) {
      if (leaf.view instanceof AudioSidebarView) {
        trackFadePromises.push(leaf.view.fadeOutAllTracks());
      }
    }

    const loopFadePromise = Promise.resolve(this.stopAllLoops());
    this.stopAllSfx();

    return Promise.all([...trackFadePromises, loopFadePromise]).then(() => {
      this.refreshNowPlaying();
    });
  }

  async loadDefaultFolderIntoView() {
    const folder = this.getDefaultFolder();
    if (!folder) {
      if (this.settings.defaultFolderPath) {
        new Notice(`Audio Sidebar default folder not found: ${this.settings.defaultFolderPath}`);
      }
      return;
    }

    await this.loadFolderIntoLeaves(folder);
  }

  async onload() {
    await this.loadSettings();
    this.selectedFolder = null;
    this._activeSfx = new Set();
    this._activeLoops = new Map();
    this.registerView(VIEW_TYPE, (leaf) => new AudioSidebarView(leaf, this));
    this.registerDomEvent(this.app.workspace.containerEl, 'play', event => this.handleNativeAudioPlay(event), true);
    this.addSettingTab(new AudioSidebarSettingTab(this.app, this));
    this.addRibbonIcon('music', 'Audio Sidebar', () => this.activateView());
    this.app.workspace.onLayoutReady(() => {
      this.activateView();
      this.hookFileExplorer();
      this.loadDefaultFolderIntoView();
    });

    // File explorer context menu: folders get a codeblock-copy item.
    this.registerEvent(
      this.app.workspace.on('file-menu', (menu, file) => {
        if (!(file instanceof TFolder)) return;
        menu.addItem(item => item
          .setTitle('Add to note as Audio Sidebar')
          .setIcon('music')
          .onClick(() => {
            const code = `\`\`\`audiosidebar\n${file.path}\n\`\`\``;
            navigator.clipboard.writeText(code);
          })
        );
        menu.addItem(item => item
          .setTitle('Copy fade-out-all codeblock')
          .setIcon('square')
          .onClick(() => {
            const code = `\`\`\`audiofadeoutall\nFade out all audio\n\`\`\``;
            navigator.clipboard.writeText(code);
            new Notice('Codeblock copied');
          })
        );
      })
    );

    // File explorer context menu: audio files get an "Audio" submenu with
    // codeblock options for the music sidebar, one-shot SFX, and loops.
    this.registerEvent(
      this.app.workspace.on('file-menu', (menu, file) => {
        if (!(file instanceof TFile)) return;
        if (!AUDIO_EXTENSIONS.includes(file.extension.toLowerCase())) return;
        menu.addItem(item => {
          item.setTitle('Audio').setIcon('music');
          const submenu = item.setSubmenu();
          submenu.addItem(sub => sub
            .setTitle('Copy track codeblock')
            .setIcon('copy')
            .onClick(() => {
              const code = `\`\`\`audiosidebar\n${file.parent.path}#${file.basename}\n\`\`\``;
              navigator.clipboard.writeText(code);
              new Notice('Codeblock copied');
            })
          );
          submenu.addItem(sub => sub
            .setTitle('Copy SFX codeblock')
            .setIcon('copy')
            .onClick(() => {
              const parent = file.parent;
              const folderPath = parent && parent.path !== '/' ? parent.path : null;
              const ref = folderPath ? `${folderPath}#${file.basename}` : file.basename;
              const code = `\`\`\`audiosfx\n${ref}\n\`\`\``;
              navigator.clipboard.writeText(code);
              new Notice('Codeblock copied');
            })
          );
          submenu.addItem(sub => sub
            .setTitle('Copy loop codeblock')
            .setIcon('copy')
            .onClick(() => {
              const parent = file.parent;
              const folderPath = parent && parent.path !== '/' ? parent.path : null;
              const ref = folderPath ? `${folderPath}#${file.basename}` : file.basename;
              const code = `\`\`\`audioloop\n${ref}\n\`\`\``;
              navigator.clipboard.writeText(code);
              new Notice('Codeblock copied');
            })
          );
          submenu.addItem(sub => sub
            .setTitle('Copy fade-out-all codeblock')
            .setIcon('square')
            .onClick(() => {
              const code = `\`\`\`audiofadeoutall\nFade out all audio\n\`\`\``;
              navigator.clipboard.writeText(code);
              new Notice('Codeblock copied');
            })
          );
        });
      })
    );

    // Loads the specified folder into the sidebar and optionally auto-plays a
    // track. The setTimeout gives loadFolder time to render the track list
    // before playTrack tries to query it.
    this.registerMarkdownCodeBlockProcessor('audiosidebar', (source, el) => {
      const [folderPart, trackPart] = source.trim().split('#');
      const folderName = folderPart.trim();
      const trackName = trackPart ? trackPart.trim().toLowerCase() : null;
      const folder = this.app.vault.getAbstractFileByPath(folderName);

      const btn = el.createEl('button', { cls: 'audio-sb-codeblock-btn' });
      btn.createEl('span', { text: '♪', cls: 'audio-sb-codeblock-icon' });
      const labelEl = btn.createEl('span', { cls: 'audio-sb-codeblock-label' });
      labelEl.createEl('span', { text: folderName.split('/').pop(), cls: 'audio-sb-codeblock-folder' });
      if (trackName) labelEl.createEl('span', { text: ` · ${trackPart.trim()}`, cls: 'audio-sb-codeblock-track' });

      if (!folder) {
        btn.createEl('span', { text: 'Folder not found', cls: 'audio-sb-codeblock-error' });
        btn.disabled = true;
        return;
      }

      btn.onclick = () => {
        this.selectedFolder = folder;
        this.activateView().then(() => {
          const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE);
          for (const leaf of leaves) {
            if (leaf.view instanceof AudioSidebarView) {
              leaf.view.loadFolder(folder);
              if (trackName) {
                setTimeout(() => leaf.view.playTrack(trackName), 50);
              }
            }
          }
        });
      };
    });

    this.registerMarkdownCodeBlockProcessor('audiosfx', (source, el) => {
      const fileSource = source.trim();
      const file = this.resolveSfxFile(fileSource);

      const btn = el.createEl('button', { cls: 'audio-sb-codeblock-btn' });
      btn.createEl('span', { text: '♪', cls: 'audio-sb-codeblock-icon' });
      const labelEl = btn.createEl('span', { cls: 'audio-sb-codeblock-label' });
      labelEl.createEl('span', {
        text: file ? file.basename : fileSource,
        cls: 'audio-sb-codeblock-folder'
      });

      if (!file) {
        btn.createEl('span', { text: 'Sound not found', cls: 'audio-sb-codeblock-error' });
        btn.disabled = true;
        return;
      }

      btn.onclick = () => this.playSfx(file);
    });

    // Clicking the button toggles the loop on/off. The icon updates to reflect
    // the current state so you can tell at a glance whether it's running.
    this.registerMarkdownCodeBlockProcessor('audioloop', (source, el) => {
      const fileSource = source.trim();
      const file = this.resolveLoopFile(fileSource);

      const btn = el.createEl('button', { cls: 'audio-sb-codeblock-btn' });
      const iconEl = btn.createEl('span', { text: '↻', cls: 'audio-sb-codeblock-icon' });
      const labelEl = btn.createEl('span', { cls: 'audio-sb-codeblock-label' });
      labelEl.createEl('span', {
        text: file ? file.basename : fileSource,
        cls: 'audio-sb-codeblock-folder'
      });

      if (!file) {
        btn.createEl('span', { text: 'Sound not found', cls: 'audio-sb-codeblock-error' });
        btn.disabled = true;
        return;
      }

      const updateState = () => {
        const active = this._activeLoops.has(file.path);
        iconEl.textContent = active ? '◼' : '↻';
        btn.classList.toggle('audio-sb-codeblock-loop-active', active);
      };

      btn.onclick = () => {
        if (this._activeLoops.has(file.path)) {
          this.stopLoop(file);
        } else {
          this.playLoop(file);
        }
        updateState();
      };
    });

    this.registerMarkdownCodeBlockProcessor('audiofadeoutall', (source, el) => {
      const label = source.trim() || 'Fade out all audio';
      const btn = el.createEl('button', {
        cls: 'audio-sb-codeblock-btn audio-sb-codeblock-fadeall-btn'
      });
      const iconEl = btn.createEl('span', { cls: 'audio-sb-codeblock-icon' });
      setIcon(iconEl, 'square');
      const labelEl = btn.createEl('span', { cls: 'audio-sb-codeblock-label' });
      labelEl.createEl('span', {
        text: label,
        cls: 'audio-sb-codeblock-folder'
      });

      btn.onclick = () => {
        this.fadeOutAllAudio();
      };
    });

    // Parses name/music/loop lines and renders a single scene-launch button.
    // Clicking fades out all current audio, then starts the configured music
    // track and loops together.
    this.registerMarkdownCodeBlockProcessor('audioscene', (source, el) => {
      const lines = source.trim().split('\n').map(l => l.trim()).filter(Boolean);
      let sceneName = '';
      let musicRef = null;
      const loopRefs = [];

      for (const line of lines) {
        if (line.startsWith('name:')) sceneName = line.slice(5).trim();
        else if (line.startsWith('music:')) musicRef = line.slice(6).trim();
        else if (line.startsWith('loop:')) loopRefs.push(line.slice(5).trim());
      }

      const btn = el.createEl('button', { cls: 'audio-sb-codeblock-btn audio-sb-codeblock-scene-btn' });
      const iconEl = btn.createEl('span', { cls: 'audio-sb-codeblock-icon' });
      setIcon(iconEl, 'play-circle');
      const labelEl = btn.createEl('span', { cls: 'audio-sb-codeblock-label' });
      labelEl.createEl('span', { text: sceneName || 'Scene', cls: 'audio-sb-codeblock-folder' });

      const tags = [];
      if (musicRef) tags.push('music');
      if (loopRefs.length > 0) tags.push(`${loopRefs.length} loop${loopRefs.length !== 1 ? 's' : ''}`);
      if (tags.length > 0) {
        labelEl.createEl('span', { text: ` · ${tags.join(' · ')}`, cls: 'audio-sb-codeblock-track' });
      }

      btn.onclick = () => {
        this.fadeOutAllAudio().then(() => {
          if (musicRef) {
            const hashIdx = musicRef.indexOf('#');
            const folderPath = hashIdx !== -1 ? musicRef.slice(0, hashIdx).trim() : musicRef.trim();
            const trackName = hashIdx !== -1 ? musicRef.slice(hashIdx + 1).trim().toLowerCase() : null;
            const folder = this.app.vault.getAbstractFileByPath(normalizePath(folderPath));
            if (folder) {
              this.selectedFolder = folder;
              this.activateView().then(() => {
                const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE);
                for (const leaf of leaves) {
                  if (leaf.view instanceof AudioSidebarView) {
                    leaf.view.loadFolder(folder);
                    if (trackName) setTimeout(() => leaf.view.playTrack(trackName), 50);
                  }
                }
              });
            }
          }
          for (const loopRef of loopRefs) {
            const loopFile = this.resolveLoopFile(loopRef);
            if (loopFile) this.playLoop(loopFile);
          }
        });
      };
    });

    this.addCommand({
      id: 'load-current-folder',
      name: 'Load audio from current note\'s folder',
      callback: () => {
        const activeFile = this.app.workspace.getActiveFile();
        if (!activeFile || !activeFile.parent) return;
        const folder = activeFile.parent;
        this.loadFolderIntoLeaves(folder);
      }
    });

    this.addCommand({
      id: 'open-sfx-picker',
      name: 'Open sound effects picker',
      callback: () => this.openSfxPicker()
    });

    this.addCommand({
      id: 'open-loop-picker',
      name: 'Open loop picker',
      callback: () => this.openLoopPicker()
    });

    this.addCommand({
      id: 'stop-all-loops',
      name: 'Stop all loops',
      callback: () => this.stopAllLoops()
    });

    this.addCommand({
      id: 'fade-out-all-audio',
      name: 'Fade out all audio',
      callback: () => this.fadeOutAllAudio()
    });
  }

  // Follow folders clicked in either the standard file explorer or Nested
  // Pages. Audio folders load immediately into the right sidebar.
  hookFileExplorer() {
    this.registerDomEvent(this.app.workspace.containerEl, 'click', (e) => {
      const target = e.target instanceof Element ? e.target : null;
      if (target?.closest('.collapse-icon')) return;
      const folderTitleEl = target?.closest('.nav-folder-title');
      const nestedRowEl = target?.closest('.nv-row');
      const folderPath = folderTitleEl?.dataset.path ?? nestedRowEl?.dataset.key;
      if (folderPath == null || (folderPath !== 'Audio' && !folderPath.startsWith('Audio/'))) return;
      const folder = folderPath === '/'
        ? this.app.vault.getRoot()
        : this.app.vault.getAbstractFileByPath(folderPath);
      if (folder instanceof TFolder && this.selectedFolder?.path !== folder.path) this.loadFolderIntoLeaves(folder);
    });
  }

  async activateView() {
    const { workspace } = this.app;
    const existing = workspace.getLeavesOfType(VIEW_TYPE);
    if (existing.length) {
      workspace.revealLeaf(existing[0]);
      return;
    }
    const leaf = workspace.getRightLeaf(false);
    if (!leaf) return;
    await leaf.setViewState({ type: VIEW_TYPE, active: true });
    workspace.revealLeaf(leaf);
  }

  onunload() {
    this.stopAllSfx();
    this.stopAllLoops();
    this.app.workspace.detachLeavesOfType(VIEW_TYPE);
  }
}

module.exports = AudioSidebarPlugin;

/* nosourcemap */
