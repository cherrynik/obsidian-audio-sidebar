import { Settings } from 'lucide-react';
import { useSyncExternalStore } from 'react';
import { IconButton } from './IconButton';
import { NowPlaying } from './NowPlaying';
import { TrackList } from './TrackList';
import type { AudioSidebarController, AudioSidebarSnapshot } from './types';

export type { AudioSidebarController, AudioSidebarSnapshot, AudioTrack } from './types';

export function AudioSidebarApp({ controller, initialSnapshot }: { controller: AudioSidebarController; initialSnapshot?: AudioSidebarSnapshot }): React.JSX.Element {
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot, () => initialSnapshot ?? controller.getSnapshot());
  const current = state.currentTrack ?? state.tracks.find(track => track.path === state.currentPath) ?? null;
  const query = state.query.toLowerCase();
  const filtered = state.tracks.filter(track => `${track.title} ${track.artist}`.toLowerCase().includes(query));

  return <>
    <section className="audio-sb-body">
      <header className="audio-sb-header">
        <div className="audio-sb-header-copy">
          <div role="heading" aria-level={2} className="audio-sb-folder-name">{state.folderName}</div>
          <span className="audio-sb-count">{state.tracks.length} tracks</span>
        </div>
        <IconButton label="Audio Sidebar settings" className="audio-sb-icon-btn audio-sb-settings" onClick={controller.openSettings}><Settings /></IconButton>
      </header>
      <input className="audio-sb-search" type="search" placeholder="Search tracks…" value={state.query} onChange={event => controller.setQuery(event.currentTarget.value)} />
      <TrackList tracks={filtered} currentPath={state.currentPath} playing={state.playing} controller={controller} />
    </section>
    {current && <NowPlaying state={state} current={current} controller={controller} />}
  </>;
}
