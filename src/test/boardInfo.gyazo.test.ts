import { describe, it, expect } from 'vitest';

describe('boardInfo __LINK__ Gyazo URL parsing', () => {
  it('__LINK__記法でラップされたGyazo URLを正しく検出する', () => {
    const content = '__LINK__https://gyazo.com/2871e3e71c3344351d1c9b62fa4baec4__LINK__';
    
    const gyazoMatch = content.match(
      /(?:\[([^\]]*https:\/\/gyazo\.com\/[^\]]+)\]|__LINK__(https:\/\/gyazo\.com\/[a-zA-Z0-9]+)__LINK__|https:\/\/gyazo\.com\/([a-zA-Z0-9]+))/
    );
    
    expect(gyazoMatch).not.toBeNull();
    expect(gyazoMatch![2]).toBe('https://gyazo.com/2871e3e71c3344351d1c9b62fa4baec4');
    
    // IDの抽出もテスト
    const idMatch = gyazoMatch![2].match(/https:\/\/gyazo\.com\/([a-zA-Z0-9]+)/);
    expect(idMatch).not.toBeNull();
    expect(idMatch![1]).toBe('2871e3e71c3344351d1c9b62fa4baec4');
  });
  
  it('全ての記法パターンを正しく検出する', () => {
    const patterns = [
      // 角括弧
      { input: '[https://gyazo.com/abc123]', expected: 'abc123' },
      // __LINK__記法
      { input: '__LINK__https://gyazo.com/def456__LINK__', expected: 'def456' },
      // 通常のURL
      { input: 'https://gyazo.com/ghi789', expected: 'ghi789' },
    ];
    
    patterns.forEach(({ input, expected }) => {
      const gyazoMatch = input.match(
        /(?:\[([^\]]*https:\/\/gyazo\.com\/[^\]]+)\]|__LINK__(https:\/\/gyazo\.com\/[a-zA-Z0-9]+)__LINK__|https:\/\/gyazo\.com\/([a-zA-Z0-9]+))/
      );
      
      expect(gyazoMatch, `Failed for: ${input}`).not.toBeNull();
      
      let actualId: string;
      if (gyazoMatch![1]) {
        // 角括弧
        const idMatch = gyazoMatch![1].match(/https:\/\/gyazo\.com\/([a-zA-Z0-9]+)/);
        actualId = idMatch![1];
      } else if (gyazoMatch![2]) {
        // __LINK__記法
        const idMatch = gyazoMatch![2].match(/https:\/\/gyazo\.com\/([a-zA-Z0-9]+)/);
        actualId = idMatch![1];
      } else if (gyazoMatch![3]) {
        // 通常のURL
        actualId = gyazoMatch![3];
      }
      
      expect(actualId!, `Failed ID extraction for: ${input}`).toBe(expected);
    });
  });
});