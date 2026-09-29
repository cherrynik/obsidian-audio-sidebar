import * as Popover from '@radix-ui/react-popover';
import {
  Eye, ListMusic, Pause, Play, Repeat, Repeat1, Settings, SkipBack,
  SkipForward, Volume2, VolumeX, X
} from 'lucide-react';
import { useState, useSyncExternalStore, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';

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

const formatTime = (seconds: number | null): string => {
  if (seconds == null || !Number.isFinite(seconds)) return '';
  const total = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
};
const rangeStyle = (value: number, maximum: number): CSSProperties => ({
  '--audio-sb-range-progress': `${maximum > 0 ? Math.max(0, Math.min(100, value / maximum * 100)) : 0}%`
} as CSSProperties);

type IconButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string;
  children: React.ReactNode;
};

function IconButton({ label, children, ...props }: IconButtonProps): React.JSX.Element {
  return <button type="button" className="audio-sb-icon-btn" {...props}>{children}<span className="audio-sb-sr-only">{label}</span></button>;
}

function RangeControl({ label, className, value, maximum, step, format, onChange }: {
  label: string;
  className?: string;
  value: number;
  maximum: number;
  step: number;
  format(value: number): string;
  onChange(value: number): void;
}): React.JSX.Element {
  const [preview, setPreview] = useState<number | null>(null);
  const [adjusting, setAdjusting] = useState(false);
  const shownValue = preview ?? value;
  const updatePreview = (element: HTMLInputElement): void => setPreview(Number(element.value));
  const finishAdjusting = (): void => {
    setAdjusting(false);
    setPreview(null);
  };
  return <label className={`audio-sb-range${adjusting ? ' is-adjusting' : ''}${className ? ` ${className}` : ''}`} style={rangeStyle(shownValue, maximum)}>
    <span className="audio-sb-sr-only">{label}</span>
    <input
      type="range"
      min={0}
      max={maximum}
      step={step}
      value={Math.min(value, maximum)}
      onInput={event => updatePreview(event.currentTarget)}
      onChange={event => onChange(Number(event.currentTarget.value))}
      onPointerDown={event => { setAdjusting(true); updatePreview(event.currentTarget); }}
      onPointerUp={finishAdjusting}
      onPointerCancel={finishAdjusting}
      onBlur={finishAdjusting}
    />
    <output className="audio-sb-range-value" aria-hidden="true">{format(shownValue)}</output>
  </label>;
}

export function AudioSidebarApp({ controller, initialSnapshot }: {
  controller: AudioSidebarController;
  initialSnapshot?: AudioSidebarSnapshot;
}): React.JSX.Element {
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot, () => initialSnapshot ?? controller.getSnapshot());
  const current = state.currentTrack ?? state.tracks.find(track => track.path === state.currentPath) ?? null;
  const filtered = state.tracks.filter(track => `${track.title} ${track.artist}`.toLowerCase().includes(state.query.toLowerCase()));
  const onFocusPointerDown = (event: ReactPointerEvent<HTMLButtonElement>): void => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    controller.focusCurrentTrack();
  };

  return <>
    <section className="audio-sb-body">
      <header className="audio-sb-header">
        <div className="audio-sb-header-copy">
          <div role="heading" aria-level={2} className="audio-sb-folder-name">{state.folderName}</div>
          <span className="audio-sb-count">{state.tracks.length} tracks</span>
        </div>
        <IconButton label="Audio Sidebar settings" className="audio-sb-icon-btn audio-sb-settings" onClick={controller.openSettings}>
          <Settings />
        </IconButton>
      </header>
      <input
        className="audio-sb-search"
        type="search"
        placeholder="Search tracks…"
        value={state.query}
        onChange={event => controller.setQuery(event.currentTarget.value)}
      />
      <div className="audio-sb-list">
        {filtered.map(track => {
          const active = track.path === state.currentPath;
          return <div
            key={track.path}
            className={`audio-sb-item${active ? ' audio-sb-item-active' : ''}`}
            data-path={track.path}
            aria-current={active}
            onClick={() => controller.playTrack(track.path)}
            onContextMenu={event => controller.openTrackMenu(track.path, event.nativeEvent)}
          >
            <IconButton label={`${active && state.playing ? 'Pause' : 'Play'} ${track.title}`} className="audio-sb-icon-btn audio-sb-track-play" onClick={event => { event.stopPropagation(); controller.playTrack(track.path); }}>
              {active && state.playing ? <Pause /> : <Play />}
            </IconButton>
            <div className="audio-sb-track-copy">
              <span className="audio-sb-track-title">{track.title}</span>
              {track.artist && <span className="audio-sb-track-artist">{track.artist}</span>}
            </div>
            <span className="audio-sb-track-duration">{formatTime(track.duration)}</span>
          </div>;
        })}
      </div>
    </section>
    {current && <footer className="audio-sb-footer" data-testid="now-playing">
      <div className="audio-sb-current-track">
        <div className="audio-sb-current-copy">
          <div className="audio-sb-current-title">{current.title}</div>
          <div className="audio-sb-current-meta">
            {current.artist && <span className="audio-sb-current-artist">{current.artist}</span>}
            <button type="button" className="audio-sb-current-location" onClick={controller.revealCurrentFile}>{state.currentLocation || `Audio › ${state.folderName}`}</button>
          </div>
        </div>
        <div className="audio-sb-current-actions">
          <IconButton label="Focus current track" className="audio-sb-icon-btn audio-sb-focus-track" onPointerDown={onFocusPointerDown} onClick={event => { if (event.detail === 0) controller.focusCurrentTrack(); }}><Eye /></IconButton>
          <IconButton label="Close player" className="audio-sb-icon-btn audio-sb-close-player" onClick={controller.closePlayer}><X /></IconButton>
        </div>
      </div>
      <div className="audio-sb-transport">
        <IconButton label="Repeat track" aria-pressed={state.repeat} className={`audio-sb-icon-btn${state.repeat ? ' is-active' : ''}`} onClick={controller.toggleRepeat}>{state.repeat ? <Repeat1 /> : <Repeat />}</IconButton>
        <IconButton label="Previous track" onClick={controller.playPrevious}><SkipBack /></IconButton>
        <IconButton label={state.playing ? 'Pause' : 'Play'} className="audio-sb-icon-btn audio-sb-main-play" onClick={controller.togglePlayback}>
          <span className="audio-sb-main-play-surface">{state.playing ? <Pause /> : <Play />}</span>
        </IconButton>
        <IconButton label="Next track" onClick={controller.playNext}><SkipForward /></IconButton>
        <div className="audio-sb-speed-wrap" data-open={state.speedOpen} onMouseLeave={() => controller.toggleSpeed?.(false)}>
          <Popover.Root open={state.speedOpen} onOpenChange={open => controller.toggleSpeed?.(open)}>
            <Popover.Trigger asChild><button type="button" className="audio-sb-speed" onMouseEnter={() => controller.toggleSpeed?.(true)}>{state.rate}×</button></Popover.Trigger>
            <Popover.Content className="audio-sb-speed-popup" side="top" align="center" sideOffset={4} aria-label="Playback speed" onMouseEnter={() => controller.toggleSpeed?.(true)}>
              {[0.75, 1, 1.25, 1.5, 2].map(rate => <button key={rate} type="button" className={`audio-sb-speed-option${rate === state.rate ? ' is-active' : ''}`} aria-label={`${rate}×`} onClick={() => controller.setRate(rate)}>{rate}×</button>)}
            </Popover.Content>
          </Popover.Root>
        </div>
      </div>
      <div className="audio-sb-media">
        <div className="audio-sb-controls">
          <span className="audio-sb-time audio-sb-time-current">{formatTime(state.position)}</span>
          <RangeControl label="Seek" className="audio-sb-progress" value={state.position} maximum={Math.max(0, state.duration)} step={0.01} format={formatTime} onChange={controller.seek} />
          <span className="audio-sb-time audio-sb-time-duration">{formatTime(state.duration)}</span>
          <div className="audio-sb-volume">
            <IconButton label={state.muted ? 'Unmute' : 'Mute'} onClick={controller.toggleMute}>{state.muted ? <VolumeX /> : <Volume2 />}</IconButton>
            <RangeControl label="Volume" value={state.muted ? 0 : state.volume} maximum={1} step={0.01} format={value => `${Math.round(value * 100)}%`} onChange={controller.setVolume} />
          </div>
          <div className="audio-sb-queue-wrap" data-open={state.queueOpen} onMouseLeave={() => controller.toggleQueue(false)}>
            <Popover.Root open={state.queueOpen} onOpenChange={controller.toggleQueue}>
              <Popover.Trigger asChild><IconButton label="Playback queue" onMouseEnter={() => controller.toggleQueue(true)}><ListMusic /></IconButton></Popover.Trigger>
              <Popover.Content className="audio-sb-queue-popup" side="top" align="end" sideOffset={4} role="dialog" aria-label="Playback queue" onMouseEnter={() => controller.toggleQueue(true)}>
              <div className="audio-sb-queue-heading">{state.folderName}</div>
              {state.tracks.map(track => <button key={track.path} type="button" className={`audio-sb-queue-item${track.path === state.currentPath ? ' audio-sb-queue-current' : ''}`} onClick={() => controller.playTrack(track.path)} onContextMenu={event => controller.openTrackMenu(track.path, event.nativeEvent)}>
                <span className="audio-sb-queue-play">{track.path === state.currentPath && state.playing ? <Pause /> : <Play />}</span>
                <span className="audio-sb-track-copy"><span className="audio-sb-track-title">{track.title}</span>{track.artist && <span className="audio-sb-track-artist">{track.artist}</span>}</span>
                <span className="audio-sb-track-duration">{formatTime(track.duration)}</span>
              </button>)}
              </Popover.Content>
            </Popover.Root>
          </div>
        </div>
      </div>
    </footer>}
  </>;
}
