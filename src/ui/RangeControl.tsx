import { useState } from 'react';
import { rangeStyle } from './format';

export function RangeControl({ label, className, value, maximum, step, format, onChange }: {
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
