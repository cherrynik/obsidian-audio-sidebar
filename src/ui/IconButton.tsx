import type { ButtonHTMLAttributes, ReactNode } from 'react';

type IconButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string;
  children: ReactNode;
  surfaceClassName?: string;
};

export function IconButton({ label, children, surfaceClassName = '', ...props }: IconButtonProps): React.JSX.Element {
  return <button type="button" {...props}>
    <span className={`audio-sb-icon-surface${surfaceClassName ? ` ${surfaceClassName}` : ''}`} aria-hidden="true">{children}</span>
    <span className="audio-sb-sr-only">{label}</span>
  </button>;
}
