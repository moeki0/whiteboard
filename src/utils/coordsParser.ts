export interface CoordinateResult {
  isValid: boolean;
  latitude?: number;
  longitude?: number;
}

export function parseCoordinates(text: string): CoordinateResult {
  const coords = text.trim().split(',');
  
  if (coords.length !== 2) {
    return { isValid: false };
  }
  
  const latitude = parseFloat(coords[0].trim());
  const longitude = parseFloat(coords[1].trim());
  
  if (isNaN(latitude) || isNaN(longitude)) {
    return { isValid: false };
  }
  
  return {
    isValid: true,
    latitude,
    longitude,
  };
}