export type TrackName = { title: string; artist: string };

export function splitTrackName(name: string): TrackName {
  const match = /\s+[-–—]\s+/.exec(name);
  if (!match) return { title: name, artist: '' };
  const left = name.slice(0, match.index).trim();
  const right = name.slice(match.index + match[0].length).trim();
  return right.includes('@')
    ? { title: left, artist: right }
    : { title: right, artist: left };
}
