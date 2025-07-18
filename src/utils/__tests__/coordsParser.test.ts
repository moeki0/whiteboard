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
});