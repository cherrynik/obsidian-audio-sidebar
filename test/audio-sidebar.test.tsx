import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
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
  toggleSpeed: vi.fn(),
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
    const activeTrackTitle = screen.getAllByText('Open Fire').find(element => element.closest('.audio-sb-item'));
    expect(activeTrackTitle?.closest('.audio-sb-item')).toHaveClass('audio-sb-item-active');
  });

  it('filters tracks without rebuilding playback', async () => {
    const controls = controller();
    render(<AudioSidebarApp controller={controls} initialSnapshot={snapshot()} />);
    fireEvent.change(screen.getByPlaceholderText('Search tracks…'), { target: { value: '4batz' } });
    expect(controls.setQuery).toHaveBeenLastCalledWith('4batz');
  });

  it('toggles playback from the whole track row without double handling the play button', async () => {
    const controls = controller();
    render(<AudioSidebarApp controller={controls} initialSnapshot={snapshot()} />);
    const trackTitle = screen.getAllByText('Open Fire').find(element => element.closest('.audio-sb-item'));
    const trackRow = trackTitle?.closest('.audio-sb-item');
    expect(trackRow).not.toBeNull();
    await userEvent.click(trackRow!);
    expect(controls.playTrack).toHaveBeenCalledTimes(1);
    vi.mocked(controls.playTrack).mockClear();
    await userEvent.click(screen.getByRole('button', { name: 'Pause Open Fire' }));
    expect(controls.playTrack).toHaveBeenCalledTimes(1);
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

  it('renders every icon control through an isolated circular surface', () => {
    render(<AudioSidebarApp controller={controller()} initialSnapshot={snapshot()} />);
    for (const button of screen.getAllByRole('button')) {
      if (!button.classList.contains('audio-sb-icon-btn')) continue;
      expect(button.querySelector(':scope > .audio-sb-icon-surface')).not.toBeNull();
    }
    expect(screen.getByRole('button', { name: 'Pause' }).querySelector('.audio-sb-main-play-surface')).not.toBeNull();
  });

  it('updates seek and volume through stable sliders', () => {
    const controls = controller();
    render(<AudioSidebarApp controller={controls} initialSnapshot={snapshot()} />);
    fireEvent.change(screen.getByRole('slider', { name: 'Seek' }), { target: { value: '80' } });
    fireEvent.change(screen.getByRole('slider', { name: 'Volume' }), { target: { value: '0.4' } });
    expect(controls.seek).toHaveBeenCalledWith(80);
    expect(controls.setVolume).toHaveBeenCalledWith(0.4);
  });

  it('shows formatted seek and volume values without native button tooltips', () => {
    render(<AudioSidebarApp controller={controller()} initialSnapshot={snapshot()} />);
    expect(screen.getByText('00:32', { selector: 'output' })).toBeInTheDocument();
    expect(screen.getByText('80%', { selector: 'output' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Repeat track' })).not.toHaveAttribute('aria-label');
    expect(screen.getByRole('button', { name: 'Repeat track' })).not.toHaveAttribute('title');
    expect(screen.getByRole('slider', { name: 'Seek' })).not.toHaveAttribute('aria-label');
    expect(screen.getByRole('slider', { name: 'Volume' })).not.toHaveAttribute('aria-label');
  });

  it('shows a range value only while the pointer is held down', () => {
    render(<AudioSidebarApp controller={controller()} initialSnapshot={snapshot()} />);
    const seek = screen.getByRole('slider', { name: 'Seek' });
    const range = seek.closest('.audio-sb-range');
    expect(range).not.toHaveClass('is-adjusting');
    fireEvent.pointerDown(seek);
    expect(range).toHaveClass('is-adjusting');
    fireEvent.pointerUp(seek);
    expect(range).not.toHaveClass('is-adjusting');
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

  it('opens playback speed only from its trigger and keeps it open over the popup', () => {
    const controls = controller();
    const { container } = render(<AudioSidebarApp controller={controls} initialSnapshot={snapshot()} />);
    fireEvent.mouseEnter(container.querySelector('.audio-sb-speed-wrap')!);
    expect(controls.toggleSpeed).not.toHaveBeenCalled();
    fireEvent.mouseEnter(screen.getByRole('button', { name: '1×' }));
    expect(controls.toggleSpeed).toHaveBeenCalledWith(true);
  });

  it('opens the playback queue only from its trigger', () => {
    const controls = controller();
    const { container } = render(<AudioSidebarApp controller={controls} initialSnapshot={snapshot()} />);
    fireEvent.mouseEnter(container.querySelector('.audio-sb-queue-wrap')!);
    expect(controls.toggleQueue).not.toHaveBeenCalled();
    fireEvent.mouseEnter(screen.getByRole('button', { name: 'Playback queue' }));
    expect(controls.toggleQueue).toHaveBeenCalledWith(true);
  });
});

describe('theme-safe styles', () => {
  const css = readFileSync('src/styles.css', 'utf8');

  it('keeps focus geometry on the inner circular surface', () => {
    expect(css).toMatch(/\.audio-sb-icon-surface\s*\{[^}]*border-radius:\s*50%/s);
    expect(css).toMatch(/\.audio-sb-icon-btn:focus-visible\s+\.audio-sb-icon-surface/);
  });

  it('uses theme-aware colors for range value tooltips', () => {
    const rule = css.match(/\.audio-sb-range-value\s*\{([^}]*)\}/s)?.[1] ?? '';
    expect(rule).toContain('background: var(--background-secondary)');
    expect(rule).not.toContain('--background-modifier-message');
  });
});
