import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { GoogleMapEmbed } from '../components/GoogleMapEmbed';

describe('GoogleMapEmbed', () => {
  it('should render Google Map iframe with correct coordinates', () => {
    render(<GoogleMapEmbed latitude={35.6762} longitude={139.6503} />);
    
    const iframe = screen.getByRole('presentation');
    expect(iframe).toBeInTheDocument();
    expect(iframe.getAttribute('src')).toContain('35.6762,139.6503');
  });
});