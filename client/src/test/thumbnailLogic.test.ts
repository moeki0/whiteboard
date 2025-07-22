import { describe, it, expect } from 'vitest';
import {
  calculateAspectRatio,
  calculateDrawDimensions,
  getRecommendedThumbnailSize,
  extractBase64FromDataUrl,
  validateDataUrl,
} from '../utils/thumbnailLogic';

describe('thumbnailLogic', () => {
  describe('calculateAspectRatio', () => {
    it('正しいアスペクト比を計算する', () => {
      expect(calculateAspectRatio(1920, 1080)).toBe(1920 / 1080);
      expect(calculateAspectRatio(800, 600)).toBe(800 / 600);
      expect(calculateAspectRatio(100, 100)).toBe(1);
    });

    it('高さが0の場合は0を返す', () => {
      expect(calculateAspectRatio(1920, 0)).toBe(0);
    });
  });

  describe('calculateDrawDimensions', () => {
    it('横長の画像を正しく計算する', () => {
      const result = calculateDrawDimensions(1920, 1080, 800, 600);
      
      expect(result.drawWidth).toBe(800);
      expect(result.drawHeight).toBe(800 / (1920 / 1080));
      expect(result.drawX).toBe(0);
      expect(result.drawY).toBeGreaterThan(0);
    });

    it('縦長の画像を正しく計算する', () => {
      const result = calculateDrawDimensions(600, 800, 1000, 750);
      
      expect(result.drawHeight).toBe(750);
      expect(result.drawWidth).toBe(750 * (600 / 800));
      expect(result.drawX).toBeGreaterThan(0);
      expect(result.drawY).toBe(0);
    });

    it('正方形の画像を正しく計算する', () => {
      const result = calculateDrawDimensions(500, 500, 400, 600);
      
      expect(result.drawWidth).toBe(400);
      expect(result.drawHeight).toBe(400);
      expect(result.drawX).toBe(0);
      expect(result.drawY).toBe(100); // (600 - 400) / 2
    });
  });

  describe('getRecommendedThumbnailSize', () => {
    it('小さい画像はそのままのサイズを返す', () => {
      const result = getRecommendedThumbnailSize(800, 600);
      
      expect(result.width).toBe(800);
      expect(result.height).toBe(600);
    });

    it('大きい画像は推奨サイズに縮小する', () => {
      const result = getRecommendedThumbnailSize(2000, 1500, 1000, 750);
      
      expect(result.width).toBeLessThanOrEqual(1000);
      expect(result.height).toBeLessThanOrEqual(750);
      expect(result.width).toBe(1000);
      expect(result.height).toBe(750);
    });

    it('アスペクト比0の場合はデフォルトサイズを返す', () => {
      const result = getRecommendedThumbnailSize(1000, 0);
      
      expect(result.width).toBe(1000);
      expect(result.height).toBe(750);
    });

    it('カスタムの最大サイズを使用する', () => {
      const result = getRecommendedThumbnailSize(2000, 1500, 500, 400);
      
      expect(result.width).toBeLessThanOrEqual(500);
      expect(result.height).toBeLessThanOrEqual(400);
    });
  });

  describe('extractBase64FromDataUrl', () => {
    it('データURLからbase64部分を正しく抽出する', () => {
      const dataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
      const result = extractBase64FromDataUrl(dataUrl);
      
      expect(result).toBe('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==');
    });

    it('カンマがない場合は空文字を返す', () => {
      const dataUrl = 'data:image/png;base64';
      const result = extractBase64FromDataUrl(dataUrl);
      
      expect(result).toBe('');
    });

    it('空文字列の場合は空文字を返す', () => {
      const result = extractBase64FromDataUrl('');
      
      expect(result).toBe('');
    });
  });

  describe('validateDataUrl', () => {
    it('有効なデータURLを正しく検証する', () => {
      const validDataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
      const result = validateDataUrl(validDataUrl);
      
      expect(result.isValid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('空のデータURLは無効', () => {
      const result = validateDataUrl('');
      
      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Data URL is empty');
    });

    it('data:で始まらないURLは無効', () => {
      const result = validateDataUrl('http://example.com/image.png');
      
      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Invalid data URL format');
    });

    it('カンマがないデータURLは無効', () => {
      const result = validateDataUrl('data:image/png;base64');
      
      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Invalid data URL structure');
    });

    it('image/を含まないデータURLは無効', () => {
      const result = validateDataUrl('data:text/plain;base64,SGVsbG8gV29ybGQ=');
      
      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Data URL must contain image data');
    });

    it('データ部分が空のデータURLは無効', () => {
      const result = validateDataUrl('data:image/png;base64,');
      
      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Data URL contains no image data');
    });
  });
});