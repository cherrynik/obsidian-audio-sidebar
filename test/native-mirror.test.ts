import { describe, expect, it } from 'vitest';
import { shouldAcceptNativePlay } from '../src/native-mirror';

describe('native audio mirror playback', () => {
  it('does not resume a paused player when an embedded audio element autoplays on window focus', () => {
    expect(shouldAcceptNativePlay({
      playerWantsPlayback: false,
      mirrorIsSynchronizing: false,
      hasRecentUserIntent: false
    })).toBe(false);
  });

  it('accepts playback from an explicit interaction with the embedded audio element', () => {
    expect(shouldAcceptNativePlay({
      playerWantsPlayback: false,
      mirrorIsSynchronizing: false,
      hasRecentUserIntent: true
    })).toBe(true);
  });

  it('ignores play events caused by synchronization', () => {
    expect(shouldAcceptNativePlay({
      playerWantsPlayback: false,
      mirrorIsSynchronizing: true,
      hasRecentUserIntent: true
    })).toBe(false);
  });
});
