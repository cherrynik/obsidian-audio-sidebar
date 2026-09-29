import * as Popover from '@radix-ui/react-popover';
import { Eye, ListMusic, Pause, Play, Repeat, Repeat1, SkipBack, SkipForward, Volume2, VolumeX, X } from 'lucide-react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { formatTime } from './format';
import { IconButton } from './IconButton';
import { RangeControl } from './RangeControl';
import type { AudioSidebarController, AudioSidebarSnapshot, AudioTrack } from './types';

export function NowPlaying({ state, current, controller }: { state: AudioSidebarSnapshot; current: AudioTrack; controller: AudioSidebarController }): React.JSX.Element {
  const onFocusPointerDown = (event: ReactPointerEvent<HTMLButtonElement>): void => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    controller.focusCurrentTrack();
  };

  return <footer className="audio-sb-footer" data-testid="now-playing">
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
      <IconButton label="Previous track" className="audio-sb-icon-btn" onClick={controller.playPrevious}><SkipBack /></IconButton>
      <IconButton label={state.playing ? 'Pause' : 'Play'} className="audio-sb-icon-btn audio-sb-main-play" surfaceClassName="audio-sb-main-play-surface" focusOnMousePress onClick={controller.togglePlayback}>{state.playing ? <Pause /> : <Play />}</IconButton>
      <IconButton label="Next track" className="audio-sb-icon-btn" onClick={controller.playNext}><SkipForward /></IconButton>
      <div className="audio-sb-speed-wrap" data-open={state.speedOpen} onMouseLeave={() => controller.toggleSpeed?.(false)}>
        <Popover.Root open={state.speedOpen} onOpenChange={open => controller.toggleSpeed?.(open)}>
          <Popover.Trigger asChild><button type="button" className="audio-sb-speed" onPointerDown={event => { if (event.pointerType === 'mouse' && event.button === 0) event.preventDefault(); }} onMouseEnter={() => controller.toggleSpeed?.(true)}><span className="audio-sb-icon-surface">{state.rate}×</span></button></Popover.Trigger>
          <Popover.Content className="audio-sb-speed-popup" side="top" align="center" sideOffset={4} aria-label="Playback speed" onMouseEnter={() => controller.toggleSpeed?.(true)} onCloseAutoFocus={event => event.preventDefault()}>
            {[0.75, 1, 1.25, 1.5, 2].map(rate => <button key={rate} type="button" className={`audio-sb-speed-option${rate === state.rate ? ' is-active' : ''}`} aria-label={`${rate}×`} onClick={() => controller.setRate(rate)}>{rate}×</button>)}
          </Popover.Content>
        </Popover.Root>
      </div>
    </div>
    <div className="audio-sb-media"><div className="audio-sb-controls">
      <span className="audio-sb-time audio-sb-time-current">{formatTime(state.position)}</span>
      <RangeControl label="Seek" className="audio-sb-progress" value={state.position} maximum={Math.max(0, state.duration)} step={0.01} format={formatTime} onChange={controller.seek} />
      <span className="audio-sb-time audio-sb-time-duration">{formatTime(state.duration)}</span>
      <div className="audio-sb-volume">
        <IconButton label={state.muted ? 'Unmute' : 'Mute'} className="audio-sb-icon-btn" onClick={controller.toggleMute}>{state.muted ? <VolumeX /> : <Volume2 />}</IconButton>
        <RangeControl label="Volume" value={state.muted ? 0 : state.volume} maximum={1} step={0.01} format={value => `${Math.round(value * 100)}%`} onChange={controller.setVolume} />
      </div>
      <div className="audio-sb-queue-wrap" data-open={state.queueOpen} onMouseLeave={() => controller.toggleQueue(false)}>
        <Popover.Root open={state.queueOpen} onOpenChange={controller.toggleQueue}>
          <Popover.Trigger asChild><IconButton label="Playback queue" className="audio-sb-icon-btn" onMouseEnter={() => controller.toggleQueue(true)}><ListMusic /></IconButton></Popover.Trigger>
          <Popover.Content className="audio-sb-queue-popup" side="top" align="end" sideOffset={4} role="dialog" aria-label="Playback queue" onMouseEnter={() => controller.toggleQueue(true)} onCloseAutoFocus={event => event.preventDefault()}>
            <div className="audio-sb-queue-heading">{state.folderName}</div>
            {state.tracks.map(track => <button key={track.path} type="button" className={`audio-sb-queue-item${track.path === state.currentPath ? ' audio-sb-queue-current' : ''}`} onClick={() => controller.playTrack(track.path)} onContextMenu={event => controller.openTrackMenu(track.path, event.nativeEvent)}>
              <span className="audio-sb-queue-play">{track.path === state.currentPath && state.playing ? <Pause /> : <Play />}</span>
              <span className="audio-sb-track-copy"><span className="audio-sb-track-title">{track.title}</span>{track.artist && <span className="audio-sb-track-artist">{track.artist}</span>}</span>
              <span className="audio-sb-track-duration">{formatTime(track.duration)}</span>
            </button>)}
          </Popover.Content>
        </Popover.Root>
      </div>
    </div></div>
  </footer>;
}
