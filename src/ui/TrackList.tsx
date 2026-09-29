import { Pause, Play } from 'lucide-react';
import { formatTime } from './format';
import { IconButton } from './IconButton';
import type { AudioSidebarController, AudioTrack } from './types';

export function TrackList({ tracks, currentPath, playing, controller }: {
  tracks: AudioTrack[];
  currentPath: string | null;
  playing: boolean;
  controller: AudioSidebarController;
}): React.JSX.Element {
  return <div className="audio-sb-list">
    {tracks.map(track => {
      const active = track.path === currentPath;
      return <div
        key={track.path}
        className={`audio-sb-item${active ? ' audio-sb-item-active' : ''}`}
        data-path={track.path}
        aria-current={active}
        onClick={() => controller.playTrack(track.path)}
        onContextMenu={event => controller.openTrackMenu(track.path, event.nativeEvent)}
      >
        <IconButton label={`${active && playing ? 'Pause' : 'Play'} ${track.title}`} className="audio-sb-icon-btn audio-sb-track-play" focusOnMousePress onClick={event => { event.stopPropagation(); controller.playTrack(track.path); }}>
          {active && playing ? <Pause /> : <Play />}
        </IconButton>
        <div className="audio-sb-track-copy">
          <span className="audio-sb-track-title">{track.title}</span>
          {track.artist && <span className="audio-sb-track-artist">{track.artist}</span>}
        </div>
        <span className="audio-sb-track-duration">{formatTime(track.duration)}</span>
      </div>;
    })}
  </div>;
}
