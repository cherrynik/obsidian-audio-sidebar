import { ItemView, TFile, TFolder, type App, type WorkspaceLeaf } from 'obsidian';
import { createRoot, type Root } from 'react-dom/client';
import { VIEW_TYPE } from '../constants';
import type { SingleAudioPlayer } from '../player';
import { AudioSidebarApp } from '../ui/AudioSidebarApp';
import { splitTrackName } from '../ui/track-name';
import type { AudioSidebarController, AudioSidebarSnapshot, AudioTrack } from '../ui/types';

export type AudioSidebarHost = {
  app: App;
  player: SingleAudioPlayer;
  selectedFolder: TFolder | null;
  getCachedDuration(path: string): number | null;
  hasDurationResult(path: string): boolean;
  getDuration(file: TFile): Promise<number | null>;
  findAudioInFolder(folder: TFolder): TFile[];
  savePlayerSettings(): Promise<void>;
  focusCurrentTrack(): Promise<void>;
  revealCurrentFile(): Promise<void>;
  openSettings(): void;
  openTrackMenu(path: string, event: MouseEvent): void;
};

class ObsidianAudioSidebarController implements AudioSidebarController {
  private readonly listeners = new Set<() => void>();
  private folder: TFolder | null = null;
  private query = '';
  private queueOpen = false;
  private speedOpen = false;
  private snapshot: AudioSidebarSnapshot = this.createSnapshot();
  private readonly durationRequests = new Set<string>();

  constructor(private readonly plugin: AudioSidebarHost) {}

  subscribe = (listener: () => void): (() => void) => { this.listeners.add(listener); return () => this.listeners.delete(listener); };
  getSnapshot = (): AudioSidebarSnapshot => this.snapshot;
  get folderPath(): string | null { return this.folder?.path ?? null; }

  setFolder(folder: TFolder | null): void {
    if (!(folder instanceof TFolder) || this.folder?.path === folder.path) return;
    this.folder = folder;
    this.refresh();
  }

  focusTrack(path: string): boolean { return this.snapshot.tracks.some(track => track.path === path); }

  refresh(): void {
    this.snapshot = this.createSnapshot();
    for (const listener of this.listeners) listener();
    for (const track of this.snapshot.tracks) {
      if (this.plugin.hasDurationResult(track.path) || this.durationRequests.has(track.path)) continue;
      const file = this.plugin.app.vault.getAbstractFileByPath(track.path);
      if (!(file instanceof TFile)) continue;
      this.durationRequests.add(track.path);
      void this.plugin.getDuration(file).then(() => { this.durationRequests.delete(track.path); this.refresh(); });
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
    return {
      folderName: this.folder?.name || 'Audio', tracks, query: this.query,
      currentPath: currentFile?.path ?? null,
      currentTrack: currentFile ? this.createTrack(currentFile) : undefined,
      currentLocation: currentFile?.parent?.path.split('/').join(' › ') || '',
      playing: player?.playing ?? false, position: player?.position ?? 0, duration: player?.duration ?? 0,
      volume: player?.volume ?? 1, muted: player?.audio.muted ?? false, rate: player?.rate ?? 1,
      repeat: player?.audio.loop ?? false, queueOpen: this.queueOpen, speedOpen: this.speedOpen
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
  setVolume = (value: number): void => { this.plugin.player.audio.muted = false; this.plugin.player.audio.volume = Math.max(0, Math.min(1, value)); void this.plugin.savePlayerSettings(); };
  toggleMute = (): void => { this.plugin.player.audio.muted = !this.plugin.player.audio.muted; this.refresh(); };
  toggleRepeat = (): void => { this.plugin.player.audio.loop = !this.plugin.player.audio.loop; this.refresh(); };
  setRate = (value: number): void => { this.plugin.player.audio.playbackRate = value; this.speedOpen = false; void this.plugin.savePlayerSettings(); this.refresh(); };
  toggleQueue = (open: boolean): void => { this.queueOpen = open; this.refresh(); };
  toggleSpeed = (open: boolean): void => { this.speedOpen = open; this.refresh(); };
  closePlayer = (): void => this.plugin.player.stop();
  focusCurrentTrack = (): void => { void this.plugin.focusCurrentTrack(); };
  revealCurrentFile = (): void => { void this.plugin.revealCurrentFile(); };
  openSettings = (): void => this.plugin.openSettings();
  openTrackMenu = (path: string, event: MouseEvent): void => this.plugin.openTrackMenu(path, event);
}

export class AudioSidebarView extends ItemView {
  private root?: Root;
  private focusAnimation?: Animation;
  private readonly controller: ObsidianAudioSidebarController;

  constructor(leaf: WorkspaceLeaf, private readonly plugin: AudioSidebarHost) {
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
