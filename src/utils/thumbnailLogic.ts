export interface ThumbnailDimensions {
  width: number;
  height: number;
}

export interface DrawDimensions {
  drawWidth: number;
  drawHeight: number;
  drawX: number;
  drawY: number;
}

/**
 * アスペクト比を計算する
 */
export function calculateAspectRatio(width: number, height: number): number {
  if (height === 0) return 0;
  return width / height;
}

/**
 * アスペクト比を保持してリサイズする際の描画サイズと位置を計算する
 */
export function calculateDrawDimensions(
  sourceWidth: number,
  sourceHeight: number,
  targetWidth: number,
  targetHeight: number
): DrawDimensions {
  const sourceAspect = calculateAspectRatio(sourceWidth, sourceHeight);
  const targetAspect = calculateAspectRatio(targetWidth, targetHeight);

  let drawWidth: number;
  let drawHeight: number;
  let drawX: number;
  let drawY: number;

  if (sourceAspect > targetAspect) {
    // 幅に合わせる
    drawWidth = targetWidth;
    drawHeight = targetWidth / sourceAspect;
    drawX = 0;
    drawY = (targetHeight - drawHeight) / 2;
  } else {
    // 高さに合わせる
    drawHeight = targetHeight;
    drawWidth = targetHeight * sourceAspect;
    drawX = (targetWidth - drawWidth) / 2;
    drawY = 0;
  }

  return {
    drawWidth,
    drawHeight,
    drawX,
    drawY,
  };
}

/**
 * サムネイルの推奨サイズを計算する
 */
export function getRecommendedThumbnailSize(
  originalWidth: number,
  originalHeight: number,
  maxWidth: number = 1000,
  maxHeight: number = 750
): ThumbnailDimensions {
  const aspectRatio = calculateAspectRatio(originalWidth, originalHeight);
  
  if (aspectRatio === 0) {
    return { width: maxWidth, height: maxHeight };
  }

  if (originalWidth <= maxWidth && originalHeight <= maxHeight) {
    return { width: originalWidth, height: originalHeight };
  }

  const dimensions = calculateDrawDimensions(
    originalWidth,
    originalHeight,
    maxWidth,
    maxHeight
  );

  return {
    width: Math.round(dimensions.drawWidth),
    height: Math.round(dimensions.drawHeight),
  };
}

/**
 * データURLからbase64部分を抽出する
 */
export function extractBase64FromDataUrl(dataUrl: string): string {
  const parts = dataUrl.split(',');
  return parts.length > 1 ? parts[1] : '';
}

/**
 * データURLの形式を検証する
 */
export function validateDataUrl(dataUrl: string): { isValid: boolean; error?: string } {
  if (!dataUrl) {
    return { isValid: false, error: 'Data URL is empty' };
  }

  if (!dataUrl.startsWith('data:')) {
    return { isValid: false, error: 'Invalid data URL format' };
  }

  const parts = dataUrl.split(',');
  if (parts.length !== 2) {
    return { isValid: false, error: 'Invalid data URL structure' };
  }

  const [header, data] = parts;
  
  if (!header.includes('image/')) {
    return { isValid: false, error: 'Data URL must contain image data' };
  }

  if (!data) {
    return { isValid: false, error: 'Data URL contains no image data' };
  }

  return { isValid: true };
}