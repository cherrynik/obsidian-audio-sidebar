export function shouldAcceptNativePlay(options: {
  playerWantsPlayback: boolean;
  mirrorIsSynchronizing: boolean;
  hasRecentUserIntent: boolean;
}): boolean {
  if (options.playerWantsPlayback || options.mirrorIsSynchronizing) return false;
  return options.hasRecentUserIntent;
}
