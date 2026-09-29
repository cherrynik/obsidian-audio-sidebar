import type { ButtonHTMLAttributes, PointerEvent, ReactNode } from 'react';

type IconButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string;
  children: ReactNode;
  surfaceClassName?: string;
};

export function IconButton({ label, children, surfaceClassName = '', onPointerDown, ...props }: IconButtonProps): React.JSX.Element {
  const handlePointerDown = (event: PointerEvent<HTMLButtonElement>): void => {
    if (event.pointerType === 'mouse' && event.button === 0) event.preventDefault();
    onPointerDown?.(event);
  };

  return <button type="button" onPointerDown={handlePointerDown} {...props}>
    <span className={`audio-sb-icon-surface${surfaceClassName ? ` ${surfaceClassName}` : ''}`} aria-hidden="true">{children}</span>
    <span className="audio-sb-sr-only">{label}</span>
  </button>;
}
