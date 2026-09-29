import { App, ItemView, Menu, Notice, Plugin, PluginSettingTab, Setting, TFile, TFolder, type TAbstractFile, type WorkspaceLeaf } from 'obsidian';
import { createRoot, type Root } from 'react-dom/client';
import { AudioSidebarApp, type AudioSidebarController, type AudioSidebarSnapshot, type AudioTrack } from './ui/AudioSidebarApp';
import { splitTrackName } from './ui/track-name';
import { SingleAudioPlayer } from './player';
import { shouldAcceptNativePlay } from './native-mirror';

const VIEW_TYPE = 'cherrynik-audio-sidebar';
const AUDIO_EXTENSIONS = new Set(['mp3', 'wav', 'ogg', 'flac', 'm4a', 'webm', 'aac']);

class ObsidianAudioSidebarController implements AudioSidebarController {
  private readonly listeners = new Set<() => void>();
  private folder: TFolder | null = null;
  private query = '';
  private queueOpen = false;
  private speedOpen = false;
  private snapshot: AudioSidebarSnapshot = this.createSnapshot();
  private durationRequests = new Set<string>();

  constructor(private readonly plugin: AudioSidebarPlugin) {}

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): AudioSidebarSnapshot => this.snapshot;
  get folderPath(): string | null { return this.folder?.path ?? null; }

  setFolder(folder: TFolder | null): void {
    if (!(folder instanceof TFolder)) return;
    if (this.folder?.path === folder.path) return;
    this.folder = folder;
    this.refresh();
  }

  focusTrack(path: string): boolean {
    return this.snapshot.tracks.some(track => track.path === path);
  }

  refresh(): void {
    this.snapshot = this.createSnapshot();
    for (const listener of this.listeners) listener();
    for (const track of this.snapshot.tracks) {
      if (this.plugin.hasDurationResult(track.path) || this.durationRequests.has(track.path)) continue;
      const file = this.plugin.app.vault.getAbstractFileByPath(track.path);
      if (!(file instanceof TFile)) continue;
      this.durationRequests.add(track.path);
      void this.plugin.getDuration(file).then(() => {
        this.durationRequests.delete(track.path);
        this.refresh();
      });
    }
  }

  private createTrack(file: TFile): AudioTrack {
    const { title, artist } = splitTrackName(file.basename);
    return { path: file.path, title, artist, duration: this.plugin.getCachedDuration(file.path) };
  }

  private createSnapshot(): AudioSidebarSnapshot {
    const player = this.plugin.player;
    const tracks = this.folder ? this.plugin.findAudioInFolder(this.folder).map(file => this.createTrack(file)) : [];
    const currentFile = player?.file;
    const currentTrack = currentFile ? this.createTrack(currentFile) : undefined;
    return {
      folderName: this.folder?.name || 'Audio',
      tracks,
      query: this.query,
      currentPath: currentFile?.path ?? null,
      currentTrack,
      currentLocation: currentFile?.parent?.path.split('/').join(' › ') || '',
      playing: player?.playing ?? false,
      position: player?.position ?? 0,
      duration: player?.duration ?? 0,
      volume: player?.volume ?? 1,
      muted: player?.audio.muted ?? false,
      rate: player?.rate ?? 1,
      repeat: player?.audio.loop ?? false,
      queueOpen: this.queueOpen,
      speedOpen: this.speedOpen
    };
  }

  setQuery = (value: string): void => { this.query = value; this.refresh(); };
  playTrack = (path: string): void => {
    const file = this.plugin.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) return;
    if (this.plugin.player.file?.path === path) this.plugin.player.toggle();
    else this.plugin.player.play(file, this.snapshot.tracks.map(track => track.path), this.snapshot.folderName);
  };
  togglePlayback = (): void => this.plugin.player.toggle();
  playPrevious = (): void => this.plugin.player.playRelative(-1);
  playNext = (): void => this.plugin.player.playRelative(1);
  seek = (seconds: number): void => { this.plugin.player.audio.currentTime = seconds; this.refresh(); };
  setVolume = (value: number): void => {
    this.plugin.player.audio.muted = false;
    this.plugin.player.audio.volume = Math.max(0, Math.min(1, value));
    void this.plugin.savePlayerSettings();
  };
  toggleMute = (): void => { this.plugin.player.audio.muted = !this.plugin.player.audio.muted; this.refresh(); };
  toggleRepeat = (): void => { this.plugin.player.audio.loop = !this.plugin.player.audio.loop; this.refresh(); };
  setRate = (value: number): void => {
    this.plugin.player.audio.playbackRate = value;
    this.speedOpen = false;
    void this.plugin.savePlayerSettings();
    this.refresh();
  };
  toggleQueue = (open: boolean): void => { this.queueOpen = open; this.refresh(); };
  toggleSpeed = (open: boolean): void => { this.speedOpen = open; this.refresh(); };
  closePlayer = (): void => this.plugin.player.stop();
  focusCurrentTrack = (): void => { void this.plugin.focusCurrentTrack(); };
  revealCurrentFile = (): void => { void this.plugin.revealCurrentFile(); };
  openSettings = (): void => this.plugin.openSettings();
  openTrackMenu = (path: string, event: MouseEvent): void => this.plugin.openTrackMenu(path, event);
}

class AudioSidebarView extends ItemView {
  private root?: Root;
  private focusAnimation?: Animation;
  private readonly controller: ObsidianAudioSidebarController;

  constructor(leaf: WorkspaceLeaf, private readonly plugin: AudioSidebarPlugin) {
    super(leaf);
    this.controller = new ObsidianAudioSidebarController(plugin);
  }

  getViewType(): string { return VIEW_TYPE; }
  getDisplayText(): string { return 'Audio'; }
  getIcon(): string { return 'music'; }

  async onOpen(): Promise<void> {
    this.contentEl.empty();
    this.contentEl.addClass('audio-sb-view');
    this.root = createRoot(this.contentEl);
    this.root.render(<AudioSidebarApp controller={this.controller} />);
    this.controller.setFolder(this.plugin.selectedFolder);
  }

  showFolder(folder: TFolder | null): void { this.controller.setFolder(folder); }
  get folderPath(): string | null { return this.controller.folderPath; }
  refreshFolder(): void { this.controller.refresh(); }
  updatePlayer(): void { this.controller.refresh(); }

  focusTrack(path: string): boolean {
    if (!this.controller.focusTrack(path)) return false;
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const row = this.contentEl.querySelector<HTMLElement>(`.audio-sb-item[data-path="${CSS.escape(path)}"]`);
      const list = row?.closest<HTMLElement>('.audio-sb-list');
      if (!row || !list) return;
      const rowBounds = row.getBoundingClientRect();
      const listBounds = list.getBoundingClientRect();
      list.scrollTop += rowBounds.top - listBounds.top - (listBounds.height - rowBounds.height) / 2;
      this.focusAnimation?.cancel();
      this.focusAnimation = row.animate([
        { backgroundColor: 'var(--background-modifier-hover)', boxShadow: 'inset 0 0 0 1px var(--interactive-accent)', offset: 0 },
        { backgroundColor: 'var(--background-modifier-hover)', boxShadow: 'inset 0 0 0 1px var(--interactive-accent)', offset: 0.82 },
        { backgroundColor: 'transparent', boxShadow: 'inset 0 0 0 1px transparent', offset: 1 }
      ], { duration: 2000, easing: 'ease-out' });
    }));
    return true;
  }

  async onClose(): Promise<void> {
    this.focusAnimation?.cancel();
    this.root?.unmount();
    this.root = undefined;
    await this.plugin.savePlayerSettings();
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
  private nativeMirrorUserIntentUntil = new WeakMap<HTMLAudioElement, number>();
  private durationCache = new Map<string, number | null>();
  private durationPending = new Map<string, Promise<number | null>>();
  private durationQueue: Array<{ file: TFile; resolve: (duration: number | null) => void }> = [];
  private activeDurationRequests = 0;

  async focusCurrentTrack(): Promise<void> {
    const file = this.player.file;
    if (!file?.parent) return;
    await this.revealFile(file);
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

  getCachedDuration(path: string): number | null { return this.durationCache.get(path) ?? null; }
  hasDurationResult(path: string): boolean { return this.durationCache.has(path); }

  getDuration(file: TFile): Promise<number | null> {
    const cached = this.durationCache.get(file.path);
    if (cached != null) return Promise.resolve(cached);
    let pending = this.durationPending.get(file.path);
    if (!pending) {
      const request = new Promise<number | null>(resolve => {
        this.durationQueue.push({ file, resolve });
        this.drainDurationQueue();
      }).finally(() => this.durationPending.delete(file.path));
      this.durationPending.set(file.path, request);
      pending = request;
    }
    return pending.then(duration => {
      this.durationCache.set(file.path, duration);
      return duration;
    });
  }

  openTrackMenu(path: string, event: MouseEvent): void {
    event.preventDefault();
    event.stopPropagation();
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) return;
    const isCurrent = this.player.file?.path === path;
    const menu = new Menu();
    menu.addItem(item => item
      .setTitle(isCurrent && this.player.playing ? 'Pause' : 'Play')
      .setIcon(isCurrent && this.player.playing ? 'pause' : 'play')
      .onClick(() => {
        if (isCurrent) this.player.toggle();
        else this.player.play(file, this.player.queuePaths.length ? this.player.queuePaths : [path], this.player.queueName || file.parent?.name || 'Audio');
      }));
    menu.addItem(item => item.setTitle('Show in Files').setIcon('folder-search').onClick(() => void this.revealFile(file)));
    menu.showAtMouseEvent(event);
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
    this.registerDomEvent(this.app.workspace.containerEl, 'pointerdown', event => this.rememberNativeMirrorIntent(event), true);
    this.registerDomEvent(window, 'focus', () => this.resynchronizeNativeMirrors());
    this.registerDomEvent(document, 'visibilitychange', () => this.resynchronizeNativeMirrors());
    this.registerDomEvent(this.app.workspace.containerEl, 'click', event => {
      this.followFolderClick(event);
      if (event.detail === 2) this.playAudioFileFromExplorer(event);
    }, true);
    this.registerDomEvent(this.app.workspace.containerEl, 'dblclick', event => this.playAudioFileFromExplorer(event), true);
    this.registerEvent(this.app.workspace.on('file-open', file => {
      if (!(file instanceof TFile) || !AUDIO_EXTENSIONS.has(file.extension.toLowerCase())) return;
      if (this.followFilesSelection && file.parent) this.selectFolder(file.parent);
      for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE)) {
        if (leaf.view instanceof AudioSidebarView) leaf.view.focusTrack(file.path);
      }
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
  private rememberNativeMirrorIntent(event: PointerEvent): void {
    const target = event.target;
    if (!(target instanceof HTMLAudioElement) || !this.nativeMirrors.has(target)) return;
    this.nativeMirrorUserIntentUntil.set(target, performance.now() + 1200);
  }
  private hasRecentNativeMirrorIntent(audio: HTMLAudioElement): boolean {
    return performance.now() < (this.nativeMirrorUserIntentUntil.get(audio) ?? 0);
  }
  private resynchronizeNativeMirrors(): void {
    for (const mirror of this.nativeMirrors) this.markNativeMirrorSync(mirror, 1200);
    this.syncNativeMirrors();
    const file = this.player.file;
    if (file) this.attachNativeMirror(file);
    requestAnimationFrame(() => this.syncNativeMirrors());
    window.setTimeout(() => {
      if (this.player.file) this.attachNativeMirror(this.player.file);
      this.syncNativeMirrors();
    }, 250);
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
  private playAudioFileFromExplorer(event: MouseEvent): void {
    const target = event.target instanceof Element ? event.target : null;
    const standardEntry = target?.closest<HTMLElement>('.nav-file');
    const standardRow = target?.closest<HTMLElement>('.nav-file-title')
      ?? standardEntry?.querySelector<HTMLElement>('.nav-file-title');
    const nestedRow = target?.closest<HTMLElement>('.nv-row');
    const path = standardRow?.dataset.path ?? standardEntry?.dataset.path ?? nestedRow?.dataset.key;
    if (!path) return;
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile) || !AUDIO_EXTENSIONS.has(file.extension.toLowerCase())) return;
    event.preventDefault();
    if (this.player.file?.path === file.path) {
      if (!this.player.playing) this.player.resume();
      return;
    }
    const queue = file.parent ? this.findAudioInFolder(file.parent).map(track => track.path) : [file.path];
    this.player.play(file, queue, file.parent?.name || 'Audio');
  }
  private selectFolder(folder: TFolder): void {
    if (this.selectedFolder?.path === folder.path) return;
    this.selectedFolder = folder;
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE)) {
      if (leaf.view instanceof AudioSidebarView && leaf.view.folderPath !== folder.path) leaf.view.showFolder(folder);
    }
  }
  private async handoffNativeAudio(event: Event): Promise<void> {
    const audio = event.target;
    if (!(audio instanceof HTMLAudioElement) || audio.closest('.audio-sb-view')) return;
    if (this.nativeMirrors.has(audio)) {
      const acceptPlay = shouldAcceptNativePlay({
        playerWantsPlayback: this.player.wantsPlayback,
        mirrorIsSynchronizing: this.isNativeMirrorSyncing(audio),
        hasRecentUserIntent: this.hasRecentNativeMirrorIntent(audio)
      });
      this.nativeMirrorUserIntentUntil.delete(audio);
      if (acceptPlay) this.player.resume();
      else if (!this.player.wantsPlayback && !audio.paused) {
        this.markNativeMirrorSync(audio);
        audio.pause();
      }
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
