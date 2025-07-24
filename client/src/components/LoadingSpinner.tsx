import React from 'react';

interface LoadingSpinnerProps {
  size?: number;
  color?: string;
}

export function LoadingSpinner({ size = 16, color = '#ffffff' }: LoadingSpinnerProps) {
  return (
    <div
      className="loading-spinner"
      style={{
        '--spinner-size': `${size}px`,
        '--spinner-color': color,
        '--spinner-border-color': `${color}40`,
        width: 'var(--spinner-size)',
        height: 'var(--spinner-size)',
        borderColor: 'var(--spinner-border-color)',
        borderTopColor: 'var(--spinner-color)',
      } as React.CSSProperties}
    />
  );
}