import { App, Menu, Notice, Plugin, PluginSettingTab, Setting, TFile, TFolder, type TAbstractFile } from 'obsidian';
import { AUDIO_EXTENSIONS, VIEW_TYPE } from './constants';
import { AudioSidebarView } from './obsidian/AudioSidebarView';
import { SingleAudioPlayer } from './player';
import { AudioDurationCache } from './services/AudioDurationCache';

export default class AudioSidebarPlugin extends Plugin {
  player!: SingleAudioPlayer;
  selectedFolder: TFolder | null = null;
  followFilesSelection = true;
  private playerSettings = { volume: 1, rate: 1 };
  private mediaSessionOwned = false;
  private durationCache!: AudioDurationCache;

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

  getCachedDuration(path: string): number | null { return this.durationCache.get(path); }
  hasDurationResult(path: string): boolean { return this.durationCache.has(path); }
  getDuration(file: TFile): Promise<number | null> { return this.durationCache.load(file); }

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

  async onload(): Promise<void> {
    this.durationCache = new AudioDurationCache(this.app);
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
    this.registerDomEvent(this.app.workspace.containerEl, 'click', event => {
      if (this.handleAudioFileExplorerClick(event)) return;
      this.followFolderClick(event);
    }, true);
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
  }
  private handleRename(file: TAbstractFile, oldPath: string): void {
    const newPath = file.path;
    this.durationCache.rename(oldPath, newPath);
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
  private handleAudioFileExplorerClick(event: MouseEvent): boolean {
    const target = event.target instanceof Element ? event.target : null;
    const standardEntry = target?.closest<HTMLElement>('.nav-file');
    const standardRow = target?.closest<HTMLElement>('.nav-file-title')
      ?? standardEntry?.querySelector<HTMLElement>('.nav-file-title');
    const nestedRow = target?.closest<HTMLElement>('.nv-row');
    const path = standardRow?.dataset.path ?? standardEntry?.dataset.path ?? nestedRow?.dataset.key;
    if (!path) return false;
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile) || !AUDIO_EXTENSIONS.has(file.extension.toLowerCase())) return false;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (this.followFilesSelection && file.parent) this.selectFolder(file.parent);
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE)) {
      if (leaf.view instanceof AudioSidebarView) leaf.view.focusTrack(file.path);
    }
    if (event.detail >= 2) {
      if (this.player.file?.path === file.path) {
        if (!this.player.playing) this.player.resume();
      } else {
        const queue = file.parent ? this.findAudioInFolder(file.parent).map(track => track.path) : [file.path];
        this.player.play(file, queue, file.parent?.name || 'Audio');
      }
    }
    return true;
  }
  private selectFolder(folder: TFolder): void {
    if (this.selectedFolder?.path === folder.path) return;
    this.selectedFolder = folder;
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE)) {
      if (leaf.view instanceof AudioSidebarView && leaf.view.folderPath !== folder.path) leaf.view.showFolder(folder);
    }
  }
  async revealCurrentFile(): Promise<void> {
    const file = this.player.file;
    if (!file) return;
    await this.revealFile(file);
  }
  async revealFile(file: TFile): Promise<void> {
    const explorerLeaf = this.app.workspace.getLeavesOfType('file-explorer')[0];
    const explorerView = explorerLeaf?.view as unknown as {
      revealInFolder?: (target: TFile) => Promise<void> | void;
    } | undefined;
    await explorerView?.revealInFolder?.(file);
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
