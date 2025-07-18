import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { OpenStreetMapEmbed } from '../components/OpenStreetMapEmbed';

describe('OpenStreetMapEmbed', () => {
  it('should render OpenStreetMap iframe with correct coordinates', () => {
    render(<OpenStreetMapEmbed latitude={35.6762} longitude={139.6503} />);
    
    const iframe = screen.getByRole('presentation');
    expect(iframe).toBeInTheDocument();
    expect(iframe.getAttribute('src')).toContain('35.6762');
    expect(iframe.getAttribute('src')).toContain('139.6503');
  });

  it('should include marker in the map URL', () => {
    render(<OpenStreetMapEmbed latitude={35.6762} longitude={139.6503} />);
    
    const iframe = screen.getByRole('presentation');
    expect(iframe.getAttribute('src')).toContain('marker=35.6762,139.6503');
  });
});