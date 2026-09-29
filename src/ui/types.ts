export type AudioTrack = {
  path: string;
  title: string;
  artist: string;
  duration: number | null;
};

export type AudioSidebarSnapshot = {
  folderName: string;
  tracks: AudioTrack[];
  query: string;
  currentPath: string | null;
  currentTrack?: AudioTrack;
  currentLocation?: string;
  playing: boolean;
  position: number;
  duration: number;
  volume: number;
  muted: boolean;
  rate: number;
  repeat: boolean;
  queueOpen: boolean;
  speedOpen: boolean;
};

export type AudioSidebarController = {
  subscribe(listener: () => void): () => void;
  getSnapshot(): AudioSidebarSnapshot;
  setQuery(value: string): void;
  playTrack(path: string): void;
  togglePlayback(): void;
  playPrevious(): void;
  playNext(): void;
  seek(seconds: number): void;
  setVolume(value: number): void;
  toggleMute(): void;
  toggleRepeat(): void;
  setRate(value: number): void;
  toggleQueue(open: boolean): void;
  toggleSpeed?(open: boolean): void;
  closePlayer(): void;
  focusCurrentTrack(): void;
  revealCurrentFile(): void;
  openSettings(): void;
  openTrackMenu(path: string, event: MouseEvent): void;
};
