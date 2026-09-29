import { App, ItemView, Menu, Notice, Plugin, PluginSettingTab, Setting, TFile, TFolder, setIcon, type TAbstractFile, type WorkspaceLeaf } from 'obsidian';
// @ts-expect-error Plyr's published declaration mixes export= with a default export.
import Plyr from 'plyr';
import plyrIcons from '../node_modules/plyr/dist/plyr.svg';
import { SingleAudioPlayer } from './player';

const VIEW_TYPE = 'cherrynik-audio-sidebar';
const AUDIO_EXTENSIONS = new Set(['mp3', 'wav', 'ogg', 'flac', 'm4a', 'webm', 'aac']);
const formatTime = (seconds: number): string => {
  const total = Math.max(0, Math.floor(Number(seconds) || 0));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
};
const trackParts = (name: string): { title: string; artist: string } => {
  const separator = /\s+[-–—]\s+/;
  const match = separator.exec(name);
  if (!match) return { title: name, artist: '' };
  const left = name.slice(0, match.index).trim();
  const right = name.slice(match.index + match[0].length).trim();
  return right.includes('@')
    ? { title: left, artist: right }
    : { title: right, artist: left };
};

class AudioSidebarView extends ItemView {
  private folder: TFolder | null = null;
  private search = '';
  private list!: HTMLElement;
  private footer!: HTMLElement;
  private title!: HTMLElement;
  private artist!: HTMLElement;
  private location!: HTMLButtonElement;
  private media!: HTMLElement;
  private previous!: HTMLButtonElement;
  private next!: HTMLButtonElement;
  private queueButton!: HTMLButtonElement;
  private queuePopup!: HTMLElement;
  private muteButton?: HTMLButtonElement;
  private repeatButton!: HTMLButtonElement;
  private speedButton!: HTMLButtonElement;
  private speedPopup!: HTMLElement;
  private plyr?: Plyr;
  private saveTimer?: number;
  private queueSignature = '';
  private durationObserver?: IntersectionObserver;
  private durationTargets = new WeakMap<Element, TFile>();
  private saveSettings = (): void => {
    window.clearTimeout(this.saveTimer);
    this.saveTimer = window.setTimeout(() => void this.plugin.savePlayerSettings(), 600);
  };
  private updateVolumeIcon = (): void => {
    if (!this.muteButton) return;
    const muted = this.plugin.player.audio.muted || this.plugin.player.audio.volume === 0;
    this.setButtonIcon(this.muteButton, muted ? 'volume-x' : 'volume-2', muted ? 'Unmute' : 'Mute');
  };

  private setButtonIcon(button: HTMLButtonElement, icon: string, label: string): void {
    button.empty();
    button.removeAttribute('aria-label');
    setIcon(button, icon);
    button.createSpan({ text: label, cls: 'audio-sb-sr-only' });
  }

  constructor(leaf: WorkspaceLeaf, private readonly plugin: AudioSidebarPlugin) { super(leaf); }
  getViewType(): string { return VIEW_TYPE; }
  getDisplayText(): string { return 'Audio'; }
  getIcon(): string { return 'music'; }

  async onOpen(): Promise<void> {
    const root = this.contentEl;
    root.empty();
    root.addClass('audio-sb-view');
    const body = root.createDiv({ cls: 'audio-sb-body' });
    this.list = body.createDiv({ cls: 'audio-sb-list' });
    this.footer = root.createDiv({ cls: 'audio-sb-footer' });
    const currentTrack = this.footer.createDiv({ cls: 'audio-sb-current-track' });
    const currentCopy = currentTrack.createDiv({ cls: 'audio-sb-current-copy' });
    this.title = currentCopy.createDiv({ cls: 'audio-sb-current-title' });
    const currentMeta = currentCopy.createDiv({ cls: 'audio-sb-current-meta' });
    this.artist = currentMeta.createSpan({ cls: 'audio-sb-current-artist' });
    this.location = currentMeta.createEl('button', {
      cls: 'audio-sb-current-location',
      type: 'button'
    });
    this.location.addEventListener('click', () => void this.plugin.revealCurrentFile());
    const currentActions = currentTrack.createDiv({ cls: 'audio-sb-current-actions' });
    this.iconButton(currentActions, 'eye', 'Focus current track', () => this.plugin.focusCurrentTrack()).addClass('audio-sb-focus-track');
    this.iconButton(currentActions, 'x', 'Close player', () => this.plugin.player.stop()).addClass('audio-sb-close-player');
    if (!document.getElementById('cherrynik-plyr-icons')) {
      const icons = document.createElement('div');
      icons.id = 'cherrynik-plyr-icons';
      icons.hidden = true;
      icons.innerHTML = plyrIcons;
      document.body.prepend(icons);
    }
    this.media = this.footer.createDiv({ cls: 'audio-sb-media' });
    this.media.appendChild(this.plugin.player.audio);
    this.plyr = new Plyr(this.plugin.player.audio, {
      controls: ['play', 'progress', 'current-time', 'duration', 'mute', 'volume'],
      speed: { selected: this.plugin.player.rate, options: [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2] },
      volume: this.plugin.player.volume,
      loadSprite: false,
      iconUrl: '',
      invertTime: false,
      keyboard: { focused: true, global: false },
      tooltips: { controls: false, seek: false }
    });
    this.muteButton = this.media.querySelector<HTMLButtonElement>("[data-plyr='mute']") || undefined;
    this.updateVolumeIcon();
    const transport = this.footer.createDiv({ cls: 'audio-sb-transport' });
    this.footer.insertBefore(transport, this.media);
    this.repeatButton = this.iconButton(transport, 'repeat-2', 'Repeat track', () => {
      this.plugin.player.audio.loop = !this.plugin.player.audio.loop;
      this.updateTransport();
    });
    this.previous = this.iconButton(transport, 'skip-back', 'Previous track', () => this.plugin.player.playRelative(-1));
    const plyrPlay = this.media.querySelector<HTMLButtonElement>("[data-plyr='play']");
    if (plyrPlay) {
      plyrPlay.addClass('audio-sb-main-play');
      transport.appendChild(plyrPlay);
    }
    this.next = this.iconButton(transport, 'skip-forward', 'Next track', () => this.plugin.player.playRelative(1));
    const speedWrap = transport.createDiv({ cls: 'audio-sb-speed-wrap' });
    this.speedButton = speedWrap.createEl('button', { cls: 'audio-sb-speed', type: 'button' });
    this.speedPopup = speedWrap.createDiv({ cls: 'audio-sb-speed-popup' });
    for (const rate of [0.75, 1, 1.25, 1.5, 2]) {
      const option = this.speedPopup.createEl('button', { cls: 'audio-sb-speed-option', type: 'button', text: `${rate}×` });
      option.addEventListener('click', () => {
        this.plugin.player.audio.playbackRate = rate;
        this.updateTransport();
      });
    }
    const controls = this.media.querySelector<HTMLElement>('.plyr__controls');
    const queueWrap = controls?.createDiv({ cls: 'audio-sb-queue-wrap' });
    if (queueWrap) {
      this.queueButton = this.iconButton(queueWrap, 'list-music', 'Playback queue', () => undefined);
      this.queuePopup = queueWrap.createDiv({ cls: 'audio-sb-queue-popup' });
    }
    this.plugin.player.audio.addEventListener('volumechange', this.saveSettings);
    this.plugin.player.audio.addEventListener('volumechange', this.updateVolumeIcon);
    this.plugin.player.audio.addEventListener('ratechange', this.saveSettings);
    this.showFolder(this.plugin.selectedFolder);
    this.updatePlayer();
  }

  focusTrack(path: string): void {
    const focusRow = (): void => {
      const row = [...this.list.querySelectorAll<HTMLElement>('.audio-sb-item')]
        .find(item => item.dataset.path === path);
      if (!row) return;
      row.scrollIntoView({ block: 'center', behavior: 'smooth' });
      row.tabIndex = -1;
      row.focus({ preventScroll: true });
    };
    requestAnimationFrame(focusRow);
  }

  showFolder(folder: TFolder | null): void {
    if (!(folder instanceof TFolder)) return;
    this.folder = folder;
    this.renderFolder();
  }

  refreshFolder(): void { this.renderFolder(); }

  private renderFolder(): void {
    const body = this.contentEl.querySelector('.audio-sb-body') as HTMLElement;
    body.empty();
    if (!this.folder) return;
    const files = this.plugin.findAudioInFolder(this.folder);
    const header = body.createDiv({ cls: 'audio-sb-header' });
    const headerCopy = header.createDiv({ cls: 'audio-sb-header-copy' });
    headerCopy.createSpan({ text: this.folder.name || 'Audio', cls: 'audio-sb-folder-name' });
    headerCopy.createSpan({ text: `${files.length} tracks`, cls: 'audio-sb-count' });
    this.iconButton(header, 'settings', 'Audio Sidebar settings', () => this.plugin.openSettings()).addClass('audio-sb-settings');
    const search = body.createEl('input', { cls: 'audio-sb-search', type: 'search', attr: { placeholder: 'Search tracks…', 'aria-label': 'Search tracks' } });
    search.value = this.search;
    search.addEventListener('input', () => { this.search = search.value; this.filterRows(); });
    body.createDiv({ cls: 'audio-sb-list-fade' });
    this.list = body.createDiv({ cls: 'audio-sb-list' });
    for (const file of files) {
      const row = this.list.createDiv({ cls: 'audio-sb-item' });
      row.dataset.path = file.path;
      row.dataset.name = file.basename.toLowerCase();
      const activateTrack = (): void => {
        if (this.plugin.player.file?.path === file.path) this.plugin.player.toggle();
        else this.plugin.player.play(file, files.map(item => item.path), this.folder?.name || 'Audio');
      };
      const button = this.iconButton(row, 'play', `Play ${file.basename}`, activateTrack);
      button.addClass('audio-sb-track-play');
      const label = trackParts(file.basename);
      const copy = row.createDiv({ cls: 'audio-sb-track-copy' });
      copy.createSpan({ text: label.title, cls: 'audio-sb-track-title' });
      if (label.artist) copy.createSpan({ text: label.artist, cls: 'audio-sb-track-artist' });
      const duration = row.createSpan({ cls: 'audio-sb-track-duration' });
      this.showDurationWhenVisible(file, duration);
      row.addEventListener('click', event => {
        if ((event.target as Element | null)?.closest('button')) return;
        activateTrack();
      });
      row.addEventListener('contextmenu', event => {
        this.showTrackMenu(event, file, files.map(entry => entry.path), this.folder?.name || 'Audio');
      });
    }
    this.filterRows();
    this.updateTrackList();
  }

  private filterRows(): void {
    const query = this.search.trim().toLowerCase();
    this.list.querySelectorAll<HTMLElement>('.audio-sb-item').forEach(row => {
      row.toggleClass('audio-sb-hidden', !!query && !row.dataset.name?.includes(query));
    });
  }

  private showDurationWhenVisible(file: TFile, target: HTMLElement): void {
    this.durationTargets.set(target, file);
    this.durationObserver ??= new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const durationTarget = entry.target as HTMLElement;
        const durationFile = this.durationTargets.get(durationTarget);
        this.durationObserver?.unobserve(durationTarget);
        if (durationFile) this.plugin.showDuration(durationFile, durationTarget);
      }
    }, { rootMargin: '100px' });
    this.durationObserver.observe(target);
  }

  private updateTrackList(): void {
    this.list.querySelectorAll<HTMLElement>('.audio-sb-item').forEach(row => {
      const active = row.dataset.path === this.plugin.player.file?.path;
      row.toggleClass('audio-sb-item-active', active);
      row.setAttribute('aria-current', active ? 'true' : 'false');
      const button = row.querySelector<HTMLButtonElement>('.audio-sb-track-play');
      if (!button) return;
      const playing = active && this.plugin.player.playing;
      this.setButtonIcon(button, playing ? 'pause' : 'play', `${playing ? 'Pause' : 'Play'} ${row.querySelector('.audio-sb-track-title')?.textContent || ''}`);
    });
  }

  updatePlayer(): void {
    const hasTrack = !!this.plugin.player.file;
    const label = trackParts(this.plugin.player.file?.basename || '');
    this.title.textContent = label.title;
    this.artist.textContent = label.artist;
    this.artist.toggleClass('audio-sb-hidden', !label.artist);
    const parentPath = this.plugin.player.file?.parent?.path || '';
    this.location.textContent = parentPath.split('/').join(' › ');
    this.location.toggleClass('audio-sb-hidden', !parentPath);
    this.footer.toggleClass('audio-sb-hidden', !hasTrack);
    this.previous.disabled = !hasTrack;
    this.next.disabled = !hasTrack;
    if (this.queueButton) this.queueButton.disabled = !this.plugin.player.queuePaths.length;
    this.updateTransport();
    this.updateQueue();
    this.updateTrackList();
  }

  private updateTransport(): void {
    if (!this.repeatButton || !this.speedButton) return;
    this.setButtonIcon(this.repeatButton, this.plugin.player.audio.loop ? 'repeat-1' : 'repeat-2', 'Repeat track');
    this.repeatButton.toggleClass('is-active', this.plugin.player.audio.loop);
    this.repeatButton.setAttribute('aria-pressed', String(this.plugin.player.audio.loop));
    this.speedButton.textContent = `${this.plugin.player.rate}×`;
    this.speedButton.removeAttribute('aria-label');
    this.speedPopup?.querySelectorAll<HTMLElement>('.audio-sb-speed-option').forEach(option => {
      option.toggleClass('is-active', option.textContent === `${this.plugin.player.rate}×`);
    });
  }

  private iconButton(parent: HTMLElement, icon: string, label: string, action: () => void): HTMLButtonElement {
    const button = parent.createEl('button', {
      cls: 'audio-sb-icon-btn',
      type: 'button'
    });
    this.setButtonIcon(button, icon, label);
    button.addEventListener('click', action);
    return button;
  }

  private showTrackMenu(event: MouseEvent, file: TFile, queuePaths: string[], queueName: string): void {
    event.preventDefault();
    event.stopPropagation();
    const isCurrent = this.plugin.player.file?.path === file.path;
    const menu = new Menu();
    menu.addItem(item => item
      .setTitle(isCurrent && this.plugin.player.playing ? 'Pause' : 'Play')
      .setIcon(isCurrent && this.plugin.player.playing ? 'pause' : 'play')
      .onClick(() => {
        if (isCurrent) this.plugin.player.toggle();
        else this.plugin.player.play(file, queuePaths, queueName);
      }));
    menu.addItem(item => item
      .setTitle('Show in Files')
      .setIcon('folder-search')
      .onClick(() => void this.plugin.revealFile(file)));
    menu.showAtMouseEvent(event);
  }

  private updateQueue(): void {
    if (!this.queuePopup) return;
    const signature = `${this.plugin.player.queueName}\n${this.plugin.player.queuePaths.join('\n')}`;
    if (signature === this.queueSignature) {
      this.updateQueueState();
      return;
    }
    this.queueSignature = signature;
    const scroll = this.queuePopup.scrollTop;
    this.queuePopup.empty();
    this.queuePopup.createDiv({ text: this.plugin.player.queueName || 'Queue', cls: 'audio-sb-queue-heading' });
    for (const path of this.plugin.player.queuePaths) {
      const file = this.app.vault.getAbstractFileByPath(path);
      if (!(file instanceof TFile)) continue;
      const row = this.queuePopup.createEl('button', { cls: 'audio-sb-queue-item', type: 'button' });
      row.dataset.path = path;
      const icon = row.createSpan({ cls: 'audio-sb-queue-play' });
      setIcon(icon, path === this.plugin.player.file?.path && this.plugin.player.playing ? 'pause' : 'play');
      const label = trackParts(file.basename);
      const copy = row.createSpan({ cls: 'audio-sb-track-copy' });
      copy.createSpan({ text: label.title, cls: 'audio-sb-track-title' });
      if (label.artist) copy.createSpan({ text: label.artist, cls: 'audio-sb-track-artist' });
      const duration = row.createSpan({ cls: 'audio-sb-track-duration' });
      this.showDurationWhenVisible(file, duration);
      row.toggleClass('audio-sb-queue-current', path === this.plugin.player.file?.path);
      row.addEventListener('click', () => {
        if (this.plugin.player.file?.path === file.path) this.plugin.player.toggle();
        else this.plugin.player.play(file, this.plugin.player.queuePaths, this.plugin.player.queueName);
      });
      row.addEventListener('contextmenu', event => {
        this.showTrackMenu(event, file, this.plugin.player.queuePaths, this.plugin.player.queueName);
      });
    }
    this.queuePopup.scrollTop = scroll;
  }

  private updateQueueState(): void {
    this.queuePopup.querySelectorAll<HTMLElement>('.audio-sb-queue-item').forEach(row => {
      const active = row.dataset.path === this.plugin.player.file?.path;
      row.toggleClass('audio-sb-queue-current', active);
      const icon = row.querySelector<HTMLElement>('.audio-sb-queue-play');
      if (icon) {
        icon.empty();
        setIcon(icon, active && this.plugin.player.playing ? 'pause' : 'play');
      }
    });
  }

  async onClose(): Promise<void> {
    window.clearTimeout(this.saveTimer);
    this.durationObserver?.disconnect();
    this.plugin.player.audio.removeEventListener('volumechange', this.saveSettings);
    this.plugin.player.audio.removeEventListener('volumechange', this.updateVolumeIcon);
    this.plugin.player.audio.removeEventListener('ratechange', this.saveSettings);
    await this.plugin.savePlayerSettings();
    this.plugin.player.stop();
    this.plyr?.destroy();
    this.plugin.resetPlayer();
  }
}

export default class AudioSidebarPlugin extends Plugin {
  player!: SingleAudioPlayer;
  selectedFolder: TFolder | null = null;
  followFilesSelection = true;
  private playerSettings = { volume: 1, rate: 1 };
  private mediaSessionOwned = false;
  private nativeMirrors = new Set<HTMLAudioElement>();
  private nativeMirrorSyncUntil = new WeakMap<HTMLAudioElement, number>();
  private durationCache = new Map<string, number>();
  private durationPending = new Map<string, Promise<number | null>>();
  private durationQueue: Array<{ file: TFile; resolve: (duration: number | null) => void }> = [];
  private activeDurationRequests = 0;

  focusCurrentTrack(): void {
    const file = this.player.file;
    if (!file?.parent) return;
    this.selectFolder(file.parent);
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE)) {
      if (leaf.view instanceof AudioSidebarView) leaf.view.focusTrack(file.path);
    }
  }

  openSettings(): void {
    const setting = (this.app as App & {
      setting?: { open: () => void; openTabById: (id: string) => void };
    }).setting;
    setting?.open();
    setting?.openTabById(this.manifest.id);
  }

  showDuration(file: TFile, target: HTMLElement): void {
    const cached = this.durationCache.get(file.path);
    if (cached != null) {
      target.textContent = formatTime(cached);
      return;
    }
    let pending = this.durationPending.get(file.path);
    if (!pending) {
      const request = new Promise<number | null>(resolve => {
        this.durationQueue.push({ file, resolve });
        this.drainDurationQueue();
      }).finally(() => this.durationPending.delete(file.path));
      this.durationPending.set(file.path, request);
      pending = request;
    }
    void pending.then(duration => {
      if (duration == null) return;
      this.durationCache.set(file.path, duration);
      if (target.isConnected) target.textContent = formatTime(duration);
    });
  }

  private drainDurationQueue(): void {
    while (this.activeDurationRequests < 2 && this.durationQueue.length) {
      const job = this.durationQueue.shift();
      if (!job) return;
      this.activeDurationRequests += 1;
      const probe = document.createElement('audio');
      let finished = false;
      const finish = (duration: number | null): void => {
        if (finished) return;
        finished = true;
        probe.removeAttribute('src');
        probe.load();
        this.activeDurationRequests -= 1;
        job.resolve(duration);
        this.drainDurationQueue();
      };
      probe.preload = 'metadata';
      probe.addEventListener('loadedmetadata', () => finish(Number.isFinite(probe.duration) ? probe.duration : null), { once: true });
      probe.addEventListener('error', () => finish(null), { once: true });
      probe.src = this.app.vault.getResourcePath(job.file);
    }
  }

  async onload(): Promise<void> {
    const saved = await this.loadData() || {};
    this.playerSettings = {
      volume: Math.max(0, Math.min(1, Number(saved.volume ?? (saved.masterVolume == null ? 1 : saved.masterVolume / 100)))),
      rate: Math.max(0.5, Math.min(2, Number(saved.rate ?? saved.playbackRate ?? 1)))
    };
    this.followFilesSelection = saved.followFilesSelection !== false;
    await this.saveSettings();
    this.resetPlayer();
    this.registerView(VIEW_TYPE, leaf => new AudioSidebarView(leaf, this));
    this.addSettingTab(new AudioSidebarSettingTab(this.app, this));
    this.addRibbonIcon('music', 'Audio Sidebar', () => void this.activateView());
    this.addCommand({ id: 'next-track', name: 'Play next track', callback: () => this.player.playRelative(1) });
    this.addCommand({ id: 'previous-track', name: 'Play previous track', callback: () => this.player.playRelative(-1) });
    this.addCommand({ id: 'toggle-playback', name: 'Play or pause', callback: () => this.player.toggle() });
    this.addCommand({ id: 'stop-playback', name: 'Stop playback', callback: () => this.player.stop() });
    this.registerDomEvent(window, 'keydown', event => {
      if (event.key === 'MediaTrackNext') { event.preventDefault(); this.player.playRelative(1); }
      if (event.key === 'MediaTrackPrevious') { event.preventDefault(); this.player.playRelative(-1); }
    });
    this.registerDomEvent(this.app.workspace.containerEl, 'play', event => void this.handoffNativeAudio(event), true);
    this.registerDomEvent(this.app.workspace.containerEl, 'pause', event => this.handleNativePause(event), true);
    this.registerDomEvent(this.app.workspace.containerEl, 'seeking', event => this.handleNativeSeek(event), true);
    this.registerDomEvent(this.app.workspace.containerEl, 'click', event => this.followFolderClick(event), true);
    this.registerEvent(this.app.workspace.on('file-open', file => {
      if (!(file instanceof TFile) || !AUDIO_EXTENSIONS.has(file.extension.toLowerCase())) return;
      if (this.followFilesSelection && file.parent) this.selectFolder(file.parent);
      this.attachNativeMirror(file);
    }));
    this.registerEvent(this.app.vault.on('create', file => {
      if (file instanceof TFile && AUDIO_EXTENSIONS.has(file.extension.toLowerCase())) this.refreshFolderViews();
    }));
    this.registerEvent(this.app.vault.on('delete', file => {
      if (file.path === this.player.file?.path) this.player.stop();
      this.refreshFolderViews();
    }));
    this.registerEvent(this.app.vault.on('rename', (file, oldPath) => this.handleRename(file, oldPath)));
    this.app.workspace.onLayoutReady(() => {
      const folder = this.app.vault.getAbstractFileByPath('Audio');
      if (folder instanceof TFolder) this.selectedFolder = folder;
      void this.activateView().then(() => {
        for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE)) {
          if (leaf.view instanceof AudioSidebarView) leaf.view.showFolder(this.selectedFolder);
        }
      });
    });
  }

  resetPlayer(): void {
    this.player = new SingleAudioPlayer(this.app, () => this.refreshViews(), error => new Notice(`Could not play audio: ${error}`), this.playerSettings);
    for (const event of ['play', 'pause', 'timeupdate', 'loadedmetadata', 'ratechange'] as const) {
      this.player.audio.addEventListener(event, () => this.syncNativeMirrors());
    }
  }
  async savePlayerSettings(): Promise<void> {
    this.playerSettings.volume = this.player.volume;
    this.playerSettings.rate = this.player.rate;
    await this.saveSettings();
  }
  async saveSettings(): Promise<void> {
    await this.saveData({ ...this.playerSettings, followFilesSelection: this.followFilesSelection });
  }
  findAudioInFolder(folder: TFolder): TFile[] {
    const files: TFile[] = [];
    const visit = (current: TFolder): void => {
      for (const child of current.children) {
        if (child instanceof TFolder) visit(child);
        else if (child instanceof TFile && AUDIO_EXTENSIONS.has(child.extension.toLowerCase())) files.push(child);
      }
    };
    visit(folder);
    return files.sort((a, b) => a.basename.localeCompare(b.basename));
  }
  private refreshViews(): void {
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE)) {
      if (leaf.view instanceof AudioSidebarView) leaf.view.updatePlayer();
    }
    this.updateMediaSession();
    this.syncNativeMirrors();
  }
  private handleRename(file: TAbstractFile, oldPath: string): void {
    const newPath = file.path;
    const cachedDuration = this.durationCache.get(oldPath);
    this.durationCache.delete(oldPath);
    if (cachedDuration != null) this.durationCache.set(newPath, cachedDuration);
    this.player.queuePaths = this.player.queuePaths.map(path =>
      path === oldPath ? newPath : path.startsWith(`${oldPath}/`) ? `${newPath}${path.slice(oldPath.length)}` : path
    );
    this.refreshFolderViews();
    this.refreshViews();
  }
  private refreshFolderViews(): void {
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE)) {
      if (leaf.view instanceof AudioSidebarView) leaf.view.refreshFolder();
    }
  }
  private syncNativeMirrors(): void {
    for (const mirror of [...this.nativeMirrors]) {
      if (!mirror.isConnected) { this.nativeMirrors.delete(mirror); continue; }
      mirror.muted = true;
      mirror.playbackRate = this.player.rate;
      if (mirror.readyState >= HTMLMediaElement.HAVE_METADATA && Math.abs(mirror.currentTime - this.player.position) > 0.35) {
        this.markNativeMirrorSync(mirror);
        mirror.currentTime = Math.min(this.player.position, Math.max(0, mirror.duration - 0.05));
      }
      if (this.player.wantsPlayback && mirror.paused && mirror.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
        this.markNativeMirrorSync(mirror);
        void mirror.play().catch(() => undefined);
      }
      else if (!this.player.wantsPlayback && !mirror.paused) {
        this.markNativeMirrorSync(mirror);
        mirror.pause();
      }
    }
  }
  private markNativeMirrorSync(audio: HTMLAudioElement, duration = 500): void {
    this.nativeMirrorSyncUntil.set(audio, performance.now() + duration);
  }
  private isNativeMirrorSyncing(audio: HTMLAudioElement): boolean {
    return performance.now() < (this.nativeMirrorSyncUntil.get(audio) ?? 0);
  }
  private attachNativeMirror(file: TFile): void {
    const attach = (attempt: number): void => {
      if (this.player.file?.path !== file.path) return;
      let attached = false;
      const activeView = this.app.workspace.activeLeaf?.view.containerEl ?? this.app.workspace.containerEl;
      for (const audio of activeView.querySelectorAll<HTMLAudioElement>('audio')) {
        if (audio.closest('.audio-sb-view')) continue;
        this.nativeMirrors.add(audio);
        this.markNativeMirrorSync(audio, 1000);
        audio.muted = true;
        audio.addEventListener('loadedmetadata', () => this.syncNativeMirrors(), { once: true });
        audio.addEventListener('canplay', () => this.syncNativeMirrors(), { once: true });
        attached = true;
      }
      this.syncNativeMirrors();
      if (!attached && attempt < 8) window.setTimeout(() => attach(attempt + 1), 100 * (attempt + 1));
    };
    window.setTimeout(() => attach(0), 0);
  }
  private updateMediaSession(): void {
    const session = navigator.mediaSession;
    if (!session) return;
    if (!this.player.file) {
      if (this.mediaSessionOwned) {
        for (const action of ['nexttrack', 'previoustrack', 'play', 'pause'] as const) {
          try { session.setActionHandler(action, null); } catch { /* Unsupported action. */ }
        }
        session.metadata = null;
        session.playbackState = 'none';
        this.mediaSessionOwned = false;
      }
      return;
    }
    this.mediaSessionOwned = true;
    if (typeof MediaMetadata !== 'undefined' && session.metadata?.title !== this.player.file.basename) {
      session.metadata = new MediaMetadata({ title: this.player.file.basename, artist: 'cherrynik Audio Sidebar' });
    }
    session.playbackState = this.player.playing ? 'playing' : 'paused';
    const actions = {
      nexttrack: () => this.player.playRelative(1), previoustrack: () => this.player.playRelative(-1),
      play: () => this.player.resume(), pause: () => this.player.pause()
    };
    for (const [action, handler] of Object.entries(actions)) {
      try { session.setActionHandler(action as MediaSessionAction, handler); } catch { /* Unsupported action. */ }
    }
  }
  private followFolderClick(event: MouseEvent): void {
    if (!this.followFilesSelection) return;
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest('.collapse-icon')) return;
    const fileExplorerFolder = target?.closest('.nav-folder-title') as HTMLElement | null;
    const path = fileExplorerFolder?.dataset.path ?? (target?.closest('.nv-row') as HTMLElement | null)?.dataset.key;
    if (!path || (path !== 'Audio' && !path.startsWith('Audio/'))) return;
    const folder = this.app.vault.getAbstractFileByPath(path);
    if (!(folder instanceof TFolder)) return;
    this.selectFolder(folder);
  }
  private selectFolder(folder: TFolder): void {
    if (this.selectedFolder?.path === folder.path) return;
    this.selectedFolder = folder;
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE)) {
      if (leaf.view instanceof AudioSidebarView && (leaf.view as AudioSidebarView)['folder']?.path !== folder.path) leaf.view.showFolder(folder);
    }
  }
  private async handoffNativeAudio(event: Event): Promise<void> {
    const audio = event.target;
    if (!(audio instanceof HTMLAudioElement) || audio.closest('.audio-sb-view')) return;
    if (this.nativeMirrors.has(audio)) {
      if (!this.player.wantsPlayback) this.player.resume();
      return;
    }
    const source = audio.currentSrc || audio.src;
    const file = this.app.vault.getFiles().find(candidate => AUDIO_EXTENSIONS.has(candidate.extension.toLowerCase()) &&
      this.app.vault.getResourcePath(candidate).split('?')[0] === source.split('?')[0]);
    if (!file) return;
    const startTime = Number.isFinite(audio.currentTime) ? audio.currentTime : 0;
    this.nativeMirrors.add(audio);
    audio.muted = true;
    await this.activateView();
    const queue = file.parent ? this.findAudioInFolder(file.parent).map(item => item.path) : [file.path];
    this.player.play(file, queue, file.parent?.name || 'Audio', startTime);
    this.syncNativeMirrors();
  }
  private handleNativePause(event: Event): void {
    const audio = event.target;
    if (audio instanceof HTMLAudioElement && this.nativeMirrors.has(audio) && !this.isNativeMirrorSyncing(audio) && this.player.wantsPlayback) this.player.pause();
  }
  private handleNativeSeek(event: Event): void {
    const audio = event.target;
    if (!(audio instanceof HTMLAudioElement) || !this.nativeMirrors.has(audio) || this.isNativeMirrorSyncing(audio) || !this.player.file) return;
    if (Math.abs(audio.currentTime - this.player.position) > 0.35) this.player.audio.currentTime = audio.currentTime;
  }
  async revealCurrentFile(): Promise<void> {
    const file = this.player.file;
    if (!file) return;
    await this.revealFile(file);
  }
  async revealFile(file: TFile): Promise<void> {
    this.selectFileInExplorer(file.path);
    await this.app.workspace.getLeaf(false).openFile(file);
    await (this.app as unknown as { commands: { executeCommandById(id: string): Promise<boolean> | boolean } })
      .commands.executeCommandById('file-explorer:reveal-active-file');
    this.selectFileInExplorer(file.path);
    requestAnimationFrame(() => this.selectFileInExplorer(file.path));
  }
  private selectFileInExplorer(path: string): void {
    window.dispatchEvent(new CustomEvent('cherrynik:explorer-select-path', { detail: { path } }));
  }
  private async activateView(): Promise<void> {
    const existing = this.app.workspace.getLeavesOfType(VIEW_TYPE);
    if (existing.length) { await this.app.workspace.revealLeaf(existing[0]); return; }
    const leaf = this.app.workspace.getRightLeaf(false);
    if (!leaf) return;
    await leaf.setViewState({ type: VIEW_TYPE, active: true });
    await this.app.workspace.revealLeaf(leaf);
  }
  onunload(): void {
    this.player.stop();
    this.app.workspace.detachLeavesOfType(VIEW_TYPE);
  }
}

class AudioSidebarSettingTab extends PluginSettingTab {
  constructor(app: App, private readonly plugin: AudioSidebarPlugin) { super(app, plugin); }

  display(): void {
    this.containerEl.empty();
    new Setting(this.containerEl)
      .setName('Follow Files selection')
      .setDesc('When you select an audio file or folder in Files, show tracks from that folder. Turn this off to keep the current Audio Sidebar list fixed while you browse.')
      .addToggle(toggle => toggle
        .setValue(this.plugin.followFilesSelection)
        .onChange(async value => {
          this.plugin.followFilesSelection = value;
          await this.plugin.saveSettings();
        }));
  }
}
