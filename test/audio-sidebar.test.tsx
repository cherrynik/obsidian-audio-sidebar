import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { AudioSidebarApp, type AudioSidebarController, type AudioSidebarSnapshot } from '../src/ui/AudioSidebarApp';
import { splitTrackName } from '../src/ui/track-name';

const tracks = [
  { path: 'Audio/Tracks/2pac — Open Fire.mp3', title: 'Open Fire', artist: '2pac', duration: 172 },
  { path: 'Audio/Tracks/4batz - act vi: mad man.mp3', title: 'act vi: mad man', artist: '4batz', duration: 158 }
];

const snapshot = (overrides: Partial<AudioSidebarSnapshot> = {}): AudioSidebarSnapshot => ({
  folderName: 'Tracks',
  tracks,
  query: '',
  currentPath: tracks[0].path,
  playing: true,
  position: 32,
  duration: 172,
  volume: 0.8,
  muted: false,
  rate: 1,
  repeat: false,
  queueOpen: false,
  speedOpen: false,
  ...overrides
});

const controller = (state = snapshot()): AudioSidebarController => ({
  subscribe: vi.fn(() => () => undefined),
  getSnapshot: vi.fn(() => state),
  setQuery: vi.fn(),
  playTrack: vi.fn(),
  togglePlayback: vi.fn(),
  playPrevious: vi.fn(),
  playNext: vi.fn(),
  seek: vi.fn(),
  setVolume: vi.fn(),
  toggleMute: vi.fn(),
  toggleRepeat: vi.fn(),
  setRate: vi.fn(),
  toggleQueue: vi.fn(),
  closePlayer: vi.fn(),
  focusCurrentTrack: vi.fn(),
  revealCurrentFile: vi.fn(),
  openSettings: vi.fn(),
  openTrackMenu: vi.fn()
});

describe('track naming', () => {
  it.each([
    ['2pac - Open Fire', { artist: '2pac', title: 'Open Fire' }],
    ['2pac – Open Fire', { artist: '2pac', title: 'Open Fire' }],
    ['2pac — Open Fire', { artist: '2pac', title: 'Open Fire' }],
    ['21 Paralysis 124 Cm — @bogdathekidd @boyblems', { artist: '@bogdathekidd @boyblems', title: '21 Paralysis 124 Cm' }]
  ])('splits %s', (name, expected) => expect(splitTrackName(name)).toEqual(expected));
});

describe('AudioSidebarApp', () => {
  it('preserves the current visual information hierarchy', () => {
    render(<AudioSidebarApp controller={controller()} initialSnapshot={snapshot()} />);
    expect(screen.getByRole('heading', { name: 'Tracks' })).toBeInTheDocument();
    expect(screen.getByText('2 tracks')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Search tracks…')).toBeInTheDocument();
    expect(screen.getAllByText('Open Fire')).not.toHaveLength(0);
    expect(screen.getAllByText('2pac')).not.toHaveLength(0);
    expect(screen.getAllByText('02:52')).not.toHaveLength(0);
    expect(screen.getByTestId('now-playing')).toHaveTextContent('Audio › Tracks');
  });

  it('filters tracks without rebuilding playback', async () => {
    const controls = controller();
    render(<AudioSidebarApp controller={controls} initialSnapshot={snapshot()} />);
    fireEvent.change(screen.getByPlaceholderText('Search tracks…'), { target: { value: '4batz' } });
    expect(controls.setQuery).toHaveBeenLastCalledWith('4batz');
  });

  it('routes every transport control through the controller', async () => {
    const controls = controller();
    render(<AudioSidebarApp controller={controls} initialSnapshot={snapshot()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Pause' }));
    await userEvent.click(screen.getByRole('button', { name: 'Previous track' }));
    await userEvent.click(screen.getByRole('button', { name: 'Next track' }));
    await userEvent.click(screen.getByRole('button', { name: 'Repeat track' }));
    await userEvent.click(screen.getByRole('button', { name: 'Mute' }));
    expect(controls.togglePlayback).toHaveBeenCalledOnce();
    expect(controls.playPrevious).toHaveBeenCalledOnce();
    expect(controls.playNext).toHaveBeenCalledOnce();
    expect(controls.toggleRepeat).toHaveBeenCalledOnce();
    expect(controls.toggleMute).toHaveBeenCalledOnce();
  });

  it('updates seek and volume through stable sliders', () => {
    const controls = controller();
    render(<AudioSidebarApp controller={controls} initialSnapshot={snapshot()} />);
    fireEvent.change(screen.getByRole('slider', { name: 'Seek' }), { target: { value: '80' } });
    fireEvent.change(screen.getByRole('slider', { name: 'Volume' }), { target: { value: '0.4' } });
    expect(controls.seek).toHaveBeenCalledWith(80);
    expect(controls.setVolume).toHaveBeenCalledWith(0.4);
  });

  it('focuses the current track on pointer down so rerenders cannot swallow the click', () => {
    const controls = controller();
    render(<AudioSidebarApp controller={controls} initialSnapshot={snapshot()} />);
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Focus current track' }), { button: 0 });
    expect(controls.focusCurrentTrack).toHaveBeenCalledOnce();
  });

  it('opens queue and speed controls from accessible buttons', async () => {
    const controls = controller();
    const state = snapshot({ queueOpen: true, speedOpen: true });
    const controlsWithOpenMenus = controller(state);
    render(<AudioSidebarApp controller={controlsWithOpenMenus} initialSnapshot={state} />);
    expect(screen.getByRole('dialog', { name: 'Playback queue' })).toBeInTheDocument();
    await userEvent.click(within(screen.getByRole('dialog', { name: 'Playback queue' })).getByText('act vi: mad man'));
    await userEvent.click(screen.getByRole('button', { name: '1.5×' }));
    expect(controlsWithOpenMenus.playTrack).toHaveBeenCalledWith(tracks[1].path);
    expect(controlsWithOpenMenus.setRate).toHaveBeenCalledWith(1.5);
  });
});
