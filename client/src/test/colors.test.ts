import { describe, it, expect } from 'vitest';
import { getUserColor, generateUserInitials } from '../utils/colors';

describe('colors', () => {
  describe('getUserColor', () => {
    it('同じユーザーIDに対して常に同じ色を返す', () => {
      const userId = 'user123';
      const color1 = getUserColor(userId);
      const color2 = getUserColor(userId);
      expect(color1).toBe(color2);
    });

    it('異なるユーザーIDに対して異なる色を返す可能性がある', () => {
      const color1 = getUserColor('user1');
      const color2 = getUserColor('user2');
      // 必ずしも異なるとは限らないが、ハッシュ関数の性質上、多くの場合異なる
      expect(typeof color1).toBe('string');
      expect(typeof color2).toBe('string');
    });

    it('有効なカラーコードを返す', () => {
      const color = getUserColor('testuser');
      expect(color).toMatch(/^#[0-9A-F]{6}$/i);
    });
  });

  describe('generateUserInitials', () => {
    it('表示名から正しくイニシャルを生成する', () => {
      expect(generateUserInitials('John Doe', null)).toBe('JD');
      expect(generateUserInitials('Alice Smith', null)).toBe('AS');
      expect(generateUserInitials('Bob', null)).toBe('B');
    });

    it('表示名がない場合はemailの最初の文字を使用する', () => {
      expect(generateUserInitials(null, 'john@example.com')).toBe('J');
      expect(generateUserInitials('', 'alice@test.com')).toBe('A');
    });

    it('表示名もemailもない場合はUを返す', () => {
      expect(generateUserInitials(null, null)).toBe('U');
      expect(generateUserInitials('', '')).toBe('U');
    });

    it('表示名が3語以上でも最初の2文字のみを使用する', () => {
      expect(generateUserInitials('John Michael Doe', null)).toBe('JM');
    });
  });
});