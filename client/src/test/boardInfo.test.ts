import { describe, it, expect } from 'vitest';

describe('boardInfo Gyazo URL parsing', () => {
  it('角括弧でラップされたGyazo URLを正しく検出する', () => {
    const content = '[https://gyazo.com/2871e3e71c3344351d1c9b62fa4baec4]';
    
    // boardInfo.tsで使用されている正規表現をテスト
    const gyazoMatch = content.match(
      /(?:\[([^\]]*https:\/\/gyazo\.com\/[^\]]+)\]|https:\/\/gyazo\.com\/([a-zA-Z0-9]+))/
    );
    
    expect(gyazoMatch).not.toBeNull();
    expect(gyazoMatch![1]).toBe('https://gyazo.com/2871e3e71c3344351d1c9b62fa4baec4');
    
    // IDの抽出もテスト
    const idMatch = gyazoMatch![1].match(/https:\/\/gyazo\.com\/([a-zA-Z0-9]+)/);
    expect(idMatch).not.toBeNull();
    expect(idMatch![1]).toBe('2871e3e71c3344351d1c9b62fa4baec4');
  });
  
  it('通常のGyazo URLを正しく検出する', () => {
    const content = 'https://gyazo.com/2871e3e71c3344351d1c9b62fa4baec4';
    
    const gyazoMatch = content.match(
      /(?:\[([^\]]*https:\/\/gyazo\.com\/[^\]]+)\]|https:\/\/gyazo\.com\/([a-zA-Z0-9]+))/
    );
    
    expect(gyazoMatch).not.toBeNull();
    expect(gyazoMatch![2]).toBe('2871e3e71c3344351d1c9b62fa4baec4');
  });
  
  it('複数のパターンが混在しても正しく検出する', () => {
    const content = 'テキスト [https://gyazo.com/abc123] その他のテキスト';
    
    const gyazoMatch = content.match(
      /(?:\[([^\]]*https:\/\/gyazo\.com\/[^\]]+)\]|https:\/\/gyazo\.com\/([a-zA-Z0-9]+))/
    );
    
    expect(gyazoMatch).not.toBeNull();
    expect(gyazoMatch![1]).toBe('https://gyazo.com/abc123');
  });
});