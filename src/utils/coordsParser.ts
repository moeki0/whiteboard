export interface CoordinateResult {
  isValid: boolean;
  latitude?: number;
  longitude?: number;
}

export function parseCoordinates(text: string): CoordinateResult {
  const trimmedText = text.trim();
  
  // [title url] 記法の場合はURL部分を抽出
  if (trimmedText.startsWith('[') && trimmedText.endsWith(']')) {
    const content = trimmedText.slice(1, -1);
    const urlMatch = content.match(/https?:\/\/[^\s]+/);
    if (urlMatch) {
      return parseCoordinates(urlMatch[0]);
    }
  }
  
  // URL記法の場合はクエリストリングからq=パラメータを抽出
  if (trimmedText.startsWith('http')) {
    try {
      const url = new URL(trimmedText);
      const qParam = url.searchParams.get('q');
      if (qParam) {
        return parseCoordinates(qParam);
      }
    } catch {
      // URLが不正な場合は通常の解析を試行
    }
  }
  
  const coords = trimmedText.split(',');
  
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