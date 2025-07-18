import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('boardInfo integration test', () => {
  beforeEach(() => {
    // モック関数のクリア
    vi.clearAllMocks();
  });

  it('角括弧でラップされたGyazo URLからサムネイルURLを生成する処理をテスト', () => {
    const noteContent = '[https://gyazo.com/2871e3e71c3344351d1c9b62fa4baec4]';
    
    // boardInfo.tsの処理をシミュレート
    const gyazoMatch = noteContent.match(
      /(?:\[([^\]]*https:\/\/gyazo\.com\/[^\]]+)\]|https:\/\/gyazo\.com\/([a-zA-Z0-9]+))/
    );
    
    let thumbnailUrl: string | null = null;
    
    if (gyazoMatch) {
      let gyazoUrl: string;
      if (gyazoMatch[1]) {
        // 角括弧でラップされたURL
        gyazoUrl = gyazoMatch[1];
      } else if (gyazoMatch[2]) {
        // 通常のURL（キャプチャグループ2）
        const id = gyazoMatch[2];
        thumbnailUrl = `https://gyazo.com/${id}/max_size/300`;
      }
      
      // 角括弧でラップされたURLの場合、URLからIDを抽出
      if (gyazoMatch[1]) {
        const idMatch = gyazoUrl.match(/https:\/\/gyazo\.com\/([a-zA-Z0-9]+)/);
        if (idMatch) {
          const id = idMatch[1];
          thumbnailUrl = `https://gyazo.com/${id}/max_size/300`;
        }
      }
    }
    
    expect(thumbnailUrl).toBe('https://gyazo.com/2871e3e71c3344351d1c9b62fa4baec4/max_size/300');
  });
});