/**
 * 16進数カラーをRGBに変換
 */
function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : null;
}

/**
 * 色の明度を計算（0-255）
 */
function getLuminance(r: number, g: number, b: number): number {
  // 標準的な明度計算式
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

/**
 * 色を調整してボーダー色を作成（彩度を下げて明度も調整）
 */
function adjustColorForBorder(hex: string, darkenAmount: number = 0.1, desaturateAmount: number = 0.3): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return '#cccccc';
  
  // グレースケール値を計算
  const gray = (rgb.r + rgb.g + rgb.b) / 3;
  
  // 彩度を下げる（グレーに近づける）
  const r = Math.round(rgb.r * (1 - desaturateAmount) + gray * desaturateAmount);
  const g = Math.round(rgb.g * (1 - desaturateAmount) + gray * desaturateAmount);
  const b = Math.round(rgb.b * (1 - desaturateAmount) + gray * desaturateAmount);
  
  // さらに暗くする
  const darkR = Math.max(0, Math.floor(r * (1 - darkenAmount)));
  const darkG = Math.max(0, Math.floor(g * (1 - darkenAmount)));
  const darkB = Math.max(0, Math.floor(b * (1 - darkenAmount)));
  
  return `#${darkR.toString(16).padStart(2, '0')}${darkG.toString(16).padStart(2, '0')}${darkB.toString(16).padStart(2, '0')}`;
}

/**
 * 付箋の背景色に基づいて適切なボーダー色を計算
 */
export function calculateBorderColor(backgroundColor: string): string {
  // 透明色の場合
  if (backgroundColor === 'transparent') {
    return 'transparent';
  }
  
  // 白色の場合
  if (backgroundColor === '#ffffff' || backgroundColor === 'white') {
    return '#dedede';
  }
  
  // 16進数カラーの場合
  if (backgroundColor.startsWith('#')) {
    const rgb = hexToRgb(backgroundColor);
    if (!rgb) return '#cccccc';
    
    const luminance = getLuminance(rgb.r, rgb.g, rgb.b);
    
    // 明るい色の場合
    if (luminance > 200) {
      return adjustColorForBorder(backgroundColor, 0.10, 0.20);
    }
    // 中間の明るさの場合
    else if (luminance > 150) {
      return adjustColorForBorder(backgroundColor, 0.08, 0.25);
    }
    // やや暗い色の場合
    else if (luminance > 100) {
      return adjustColorForBorder(backgroundColor, 0.06, 0.30);
    }
    // 非常に暗い色の場合
    else {
      return adjustColorForBorder(backgroundColor, 0.05, 0.35);
    }
  }
  
  // その他の場合はデフォルト
  return '#cccccc';
}

/**
 * 付箋の色名からボーダー色を取得
 */
export function getBorderColorFromNoteName(colorName: string): string {
  const colorMap: Record<string, string> = {
    'yellow': '#f1c40f',
    'blue': '#3498db',
    'pink': '#e91e63',
    'green': '#2ecc71',
    'purple': '#9b59b6',
    'orange': '#f39c12',
    'red': '#e74c3c',
    'gray': '#95a5a6',
    'white': '#ffffff',
    'transparent': 'transparent'
  };
  
  const backgroundColor = colorMap[colorName] || '#ffffff';
  return calculateBorderColor(backgroundColor);
}