import { describe, it, expect } from 'vitest';
import { validateUsername } from '../utils/userProfile';

describe('userProfile', () => {
  describe('validateUsername', () => {
    it('有効なユーザー名を正しく検証する', () => {
      expect(validateUsername('testuser')).toEqual({ isValid: true });
      expect(validateUsername('test_user')).toEqual({ isValid: true });
      expect(validateUsername('test-user')).toEqual({ isValid: true });
      expect(validateUsername('user123')).toEqual({ isValid: true });
      expect(validateUsername('123user')).toEqual({ isValid: true });
      expect(validateUsername('a')).toEqual({ isValid: true });
    });

    it('空のユーザー名は無効', () => {
      expect(validateUsername('')).toEqual({ 
        isValid: false, 
        error: 'Username cannot be empty' 
      });
      expect(validateUsername('   ')).toEqual({ 
        isValid: false, 
        error: 'Username cannot be empty' 
      });
    });

    it('20文字を超えるユーザー名は無効', () => {
      const longUsername = 'a'.repeat(21);
      expect(validateUsername(longUsername)).toEqual({ 
        isValid: false, 
        error: 'Username must be 20 characters or less' 
      });
    });

    it('無効な文字を含むユーザー名は無効', () => {
      expect(validateUsername('test@user')).toEqual({ 
        isValid: false, 
        error: 'Username can only contain letters, numbers, underscore, and hyphen' 
      });
      expect(validateUsername('test user')).toEqual({ 
        isValid: false, 
        error: 'Username can only contain letters, numbers, underscore, and hyphen' 
      });
      expect(validateUsername('test.user')).toEqual({ 
        isValid: false, 
        error: 'Username can only contain letters, numbers, underscore, and hyphen' 
      });
    });

    it('アンダースコアやハイフンで始まるユーザー名は無効', () => {
      expect(validateUsername('_testuser')).toEqual({ 
        isValid: false, 
        error: 'Username must start and end with a letter or number' 
      });
      expect(validateUsername('-testuser')).toEqual({ 
        isValid: false, 
        error: 'Username must start and end with a letter or number' 
      });
    });

    it('アンダースコアやハイフンで終わるユーザー名は無効', () => {
      expect(validateUsername('testuser_')).toEqual({ 
        isValid: false, 
        error: 'Username must start and end with a letter or number' 
      });
      expect(validateUsername('testuser-')).toEqual({ 
        isValid: false, 
        error: 'Username must start and end with a letter or number' 
      });
    });

    it('前後の空白は自動的に削除される', () => {
      expect(validateUsername('  testuser  ')).toEqual({ isValid: true });
    });
  });
});