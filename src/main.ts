import { ItemView, Notice, Plugin, TFile, TFolder, type WorkspaceLeaf } from 'obsidian';
// @ts-expect-error Plyr's published declaration mixes export= with a default export.
import Plyr from 'plyr';
import plyrIcons from '../node_modules/plyr/dist/plyr.svg';
import { SingleAudioPlayer } from './player';

const VIEW_TYPE = 'cherrynik-audio-sidebar';
const AUDIO_EXTENSIONS = new Set(['mp3', 'wav', 'ogg', 'flac', 'm4a', 'webm', 'aac']);

class AudioSidebarView extends ItemView {
  private folder: TFolder | null = null;
  private search = '';
  private list!: HTMLElement;
  private footer!: HTMLElement;
  private title!: HTMLElement;
  private media!: HTMLElement;
  private plyr?: Plyr;
  private saveTimer?: number;
  private saveSettings = (): void => {
    window.clearTimeout(this.saveTimer);
    this.saveTimer = window.setTimeout(() => void this.plugin.savePlayerSettings(), 600);
  };

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
    this.title = this.footer.createDiv({ cls: 'audio-sb-current-title' });
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
      controls: ['play', 'progress', 'current-time', 'duration', 'mute', 'volume', 'settings'],
      settings: ['speed', 'loop'],
      speed: { selected: this.plugin.player.rate, options: [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2] },
      volume: this.plugin.player.volume,
      loadSprite: false,
      iconUrl: '',
      invertTime: false,
      keyboard: { focused: true, global: false },
      tooltips: { controls: true, seek: true }
    });
    this.plugin.player.audio.addEventListener('volumechange', this.saveSettings);
    this.plugin.player.audio.addEventListener('ratechange', this.saveSettings);
    this.showFolder(this.plugin.selectedFolder);
    this.updatePlayer();
  }

  showFolder(folder: TFolder | null): void {
    if (!(folder instanceof TFolder)) return;
    this.folder = folder;
    this.renderFolder();
  }

  private renderFolder(): void {
    const body = this.contentEl.querySelector('.audio-sb-body') as HTMLElement;
    body.empty();
    if (!this.folder) return;
    const files = this.plugin.findAudioInFolder(this.folder);
    const header = body.createDiv({ cls: 'audio-sb-header' });
    header.createSpan({ text: this.folder.name || 'Audio', cls: 'audio-sb-folder-name' });
    header.createSpan({ text: `${files.length} tracks`, cls: 'audio-sb-count' });
    const search = body.createEl('input', { cls: 'audio-sb-search', type: 'search', attr: { placeholder: 'Search tracks…', 'aria-label': 'Search tracks' } });
    search.value = this.search;
    search.addEventListener('input', () => { this.search = search.value; this.filterRows(); });
    this.list = body.createDiv({ cls: 'audio-sb-list' });
    for (const file of files) {
      const button = this.list.createEl('button', { cls: 'audio-sb-item', type: 'button', text: file.basename });
      button.dataset.path = file.path;
      button.dataset.name = file.basename.toLowerCase();
      button.setAttribute('aria-label', `Play ${file.basename}`);
      button.onclick = () => {
        if (this.plugin.player.file?.path === file.path) this.plugin.player.toggle();
        else this.plugin.player.play(file, files.map(item => item.path), this.folder?.name || 'Audio');
      };
    }
    this.filterRows();
    this.updateTrackList();
  }

  private filterRows(): void {
    const query = this.search.trim().toLowerCase();
    this.list.querySelectorAll<HTMLButtonElement>('.audio-sb-item').forEach(row => {
      row.toggleClass('audio-sb-hidden', !!query && !row.dataset.name?.includes(query));
    });
  }

  private updateTrackList(): void {
    this.list.querySelectorAll<HTMLButtonElement>('.audio-sb-item').forEach(row => {
      const active = row.dataset.path === this.plugin.player.file?.path;
      row.toggleClass('audio-sb-item-active', active);
      row.setAttribute('aria-current', active ? 'true' : 'false');
      row.setAttribute('aria-label', `${active && this.plugin.player.playing ? 'Pause' : 'Play'} ${row.textContent}`);
    });
  }

  updatePlayer(): void {
    const hasTrack = !!this.plugin.player.file;
    this.title.textContent = this.plugin.player.file?.basename || '';
    this.footer.toggleClass('audio-sb-hidden', !hasTrack);
    this.updateTrackList();
  }

  async onClose(): Promise<void> {
    window.clearTimeout(this.saveTimer);
    this.plugin.player.audio.removeEventListener('volumechange', this.saveSettings);
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
  private playerSettings = { volume: 1, rate: 1 };
  private mediaSessionOwned = false;

  async onload(): Promise<void> {
    const saved = await this.loadData() || {};
    this.playerSettings = {
      volume: Math.max(0, Math.min(1, Number(saved.volume ?? (saved.masterVolume == null ? 1 : saved.masterVolume / 100)))),
      rate: Math.max(0.5, Math.min(2, Number(saved.rate ?? saved.playbackRate ?? 1)))
    };
    await this.saveData(this.playerSettings);
    this.resetPlayer();
    this.registerView(VIEW_TYPE, leaf => new AudioSidebarView(leaf, this));
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
    this.registerDomEvent(this.app.workspace.containerEl, 'click', event => this.followFolderClick(event));
    this.registerEvent(this.app.vault.on('delete', file => {
      if (file.path === this.player.file?.path) this.player.stop();
    }));
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
    await this.saveData(this.playerSettings);
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
      session.metadata = new MediaMetadata({ title: this.player.file.basename, artist: 'CherryNIK Audio Sidebar' });
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
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest('.collapse-icon')) return;
    const path = (target?.closest('.nav-folder-title') as HTMLElement | null)?.dataset.path ?? (target?.closest('.nv-row') as HTMLElement | null)?.dataset.key;
    if (!path || (path !== 'Audio' && !path.startsWith('Audio/'))) return;
    const folder = this.app.vault.getAbstractFileByPath(path);
    if (!(folder instanceof TFolder)) return;
    this.selectedFolder = folder;
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE)) {
      if (leaf.view instanceof AudioSidebarView && (leaf.view as AudioSidebarView)['folder']?.path !== folder.path) leaf.view.showFolder(folder);
    }
  }
  private async handoffNativeAudio(event: Event): Promise<void> {
    const audio = event.target;
    if (!(audio instanceof HTMLAudioElement) || audio.closest('.audio-sb-view')) return;
    const source = audio.currentSrc || audio.src;
    const file = this.app.vault.getFiles().find(candidate => AUDIO_EXTENSIONS.has(candidate.extension.toLowerCase()) &&
      this.app.vault.getResourcePath(candidate).split('?')[0] === source.split('?')[0]);
    if (!file) return;
    const startTime = Number.isFinite(audio.currentTime) ? audio.currentTime : 0;
    audio.pause();
    await this.activateView();
    const queue = file.parent ? this.findAudioInFolder(file.parent).map(item => item.path) : [file.path];
    this.player.play(file, queue, file.parent?.name || 'Audio', startTime);
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
