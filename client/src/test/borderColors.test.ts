import { describe, it, expect } from 'vitest';
import { calculateBorderColor, getBorderColorFromNoteName } from '../utils/borderColors';

describe('borderColors', () => {
  describe('calculateBorderColor', () => {
    it('透明色の場合はtransparentを返す', () => {
      expect(calculateBorderColor('transparent')).toBe('transparent');
    });

    it('白色の場合は薄いグレーを返す', () => {
      expect(calculateBorderColor('#ffffff')).toBe('#dedede');
      expect(calculateBorderColor('white')).toBe('#dedede');
    });

    it('明るい色の場合は適切に暗くする', () => {
      const lightYellow = '#ffeb3b';
      const borderColor = calculateBorderColor(lightYellow);
      expect(borderColor).toMatch(/^#[0-9a-f]{6}$/);
      expect(borderColor).not.toBe(lightYellow);
    });

    it('暗い色の場合は少し暗くする', () => {
      const darkBlue = '#1976d2';
      const borderColor = calculateBorderColor(darkBlue);
      expect(borderColor).toMatch(/^#[0-9a-f]{6}$/);
      expect(borderColor).not.toBe(darkBlue);
    });

    it('非常に暗い色の場合は少しだけ暗くする', () => {
      const veryDarkColor = '#212121';
      const borderColor = calculateBorderColor(veryDarkColor);
      expect(borderColor).toMatch(/^#[0-9a-f]{6}$/);
      expect(borderColor).not.toBe(veryDarkColor);
    });

    it('無効な16進数の場合はデフォルト色を返す', () => {
      expect(calculateBorderColor('#invalid')).toBe('#cccccc');
      expect(calculateBorderColor('notahex')).toBe('#cccccc');
    });
  });

  describe('getBorderColorFromNoteName', () => {
    it('yellow色の場合は適切なボーダー色を返す', () => {
      const borderColor = getBorderColorFromNoteName('yellow');
      expect(borderColor).toMatch(/^#[0-9a-f]{6}$/);
      expect(borderColor).not.toBe('#f1c40f');
    });

    it('blue色の場合は適切なボーダー色を返す', () => {
      const borderColor = getBorderColorFromNoteName('blue');
      expect(borderColor).toMatch(/^#[0-9a-f]{6}$/);
      expect(borderColor).not.toBe('#3498db');
    });

    it('white色の場合は薄いグレーを返す', () => {
      expect(getBorderColorFromNoteName('white')).toBe('#dedede');
    });

    it('transparent色の場合はtransparentを返す', () => {
      expect(getBorderColorFromNoteName('transparent')).toBe('transparent');
    });

    it('未定義の色名の場合は白色のボーダー色を返す', () => {
      expect(getBorderColorFromNoteName('unknown')).toBe('#dedede');
    });
  });
});