import type { CSSProperties } from 'react';

export const formatTime = (seconds: number | null): string => {
  if (seconds == null || !Number.isFinite(seconds)) return '';
  const total = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
};

export const rangeStyle = (value: number, maximum: number): CSSProperties => ({
  '--audio-sb-range-progress': `${maximum > 0 ? Math.max(0, Math.min(100, value / maximum * 100)) : 0}%`
} as CSSProperties);
