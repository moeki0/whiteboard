import { describe, it, expect } from 'vitest';
import { parseCoordinates } from '../coordsParser';

describe('parseCoordinates', () => {
  it('should parse valid coordinates with comma separator', () => {
    const result = parseCoordinates('35.6762,139.6503');
    expect(result).toEqual({
      isValid: true,
      latitude: 35.6762,
      longitude: 139.6503,
    });
  });

  it('should parse coordinates from URL with query string', () => {
    const result = parseCoordinates('https://maps.google.com/maps?q=35.6762,139.6503&z=15');
    expect(result).toEqual({
      isValid: true,
      latitude: 35.6762,
      longitude: 139.6503,
    });
  });

  it('should parse coordinates from [title url] notation', () => {
    const result = parseCoordinates('[Google検索 https://www.google.com/search?q=35.6762,139.6503]');
    expect(result).toEqual({
      isValid: true,
      latitude: 35.6762,
      longitude: 139.6503,
    });
  });
});