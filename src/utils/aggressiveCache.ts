/**
 * アグレッシブなキャッシュシステム
 * 5分間のキャッシュ + プリフェッチ + ServiceWorkerキャッシュ
 */

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
  accessCount: number;
}

class AggressiveCache {
  private cache = new Map<string, CacheEntry<unknown>>();
  private readonly DEFAULT_TTL = 300000; // 5分
  private readonly AGGRESSIVE_TTL = 600000; // 10分
  
  /**
   * データを取得（キャッシュ優先）
   */
  get<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;
    
    const now = Date.now();
    if (now - entry.timestamp > entry.ttl) {
      this.cache.delete(key);
      return null;
    }
    
    // アクセス回数を増やして人気度を記録
    entry.accessCount++;
    
    return entry.data as T;
  }
  
  /**
   * データを保存（人気度に応じてTTL調整）
   */
  set<T>(key: string, data: T, customTtl?: number): void {
    const existingEntry = this.cache.get(key);
    const accessCount = existingEntry ? existingEntry.accessCount : 0;
    
    // 人気のあるデータは長時間キャッシュ
    const ttl = customTtl || (accessCount > 5 ? this.AGGRESSIVE_TTL : this.DEFAULT_TTL);
    
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl,
      accessCount: accessCount + 1
    });
    
    // メモリ使用量制限（100エントリ以上で古いものを削除）
    if (this.cache.size > 100) {
      this.cleanup();
    }
  }
  
  /**
   * 古いキャッシュエントリを削除
   */
  private cleanup(): void {
    const entries = Array.from(this.cache.entries());
    const now = Date.now();
    
    // 期限切れのエントリを削除
    entries.forEach(([key, entry]) => {
      if (now - entry.timestamp > entry.ttl) {
        this.cache.delete(key);
      }
    });
    
    // まだ多すぎる場合は、アクセス頻度の低いものから削除
    if (this.cache.size > 100) {
      const sortedEntries = Array.from(this.cache.entries())
        .sort((a, b) => a[1].accessCount - b[1].accessCount);
      
      const deleteCount = this.cache.size - 80;
      for (let i = 0; i < deleteCount; i++) {
        this.cache.delete(sortedEntries[i][0]);
      }
    }
  }
  
  /**
   * プリフェッチ（バックグラウンドでデータを準備）
   */
  async prefetch<T>(
    key: string, 
    dataLoader: () => Promise<T>,
    priority: 'high' | 'low' = 'low'
  ): Promise<void> {
    // 既にキャッシュにある場合はスキップ
    if (this.get(key)) return;
    
    try {
      if (priority === 'high') {
        // 高優先度は即座に実行
        const data = await dataLoader();
        this.set(key, data, this.AGGRESSIVE_TTL);
      } else {
        // 低優先度は少し遅延させてメインスレッドを邪魔しない
        setTimeout(async () => {
          try {
            const data = await dataLoader();
            this.set(key, data);
          } catch (error) {
            console.warn('Prefetch failed:', error);
          }
        }, 100);
      }
    } catch (error) {
      console.warn('Prefetch failed:', error);
    }
  }
  
  /**
   * 統計情報を表示
   */
  getStats(): void {
    const entries = Array.from(this.cache.values());
    const totalEntries = entries.length;
    const averageAccessCount = entries.reduce((sum, e) => sum + e.accessCount, 0) / totalEntries;
    
    console.log(`📊 Cache Stats:
- Entries: ${totalEntries}
- Average access count: ${averageAccessCount.toFixed(2)}
- Memory usage: ~${(totalEntries * 1024).toLocaleString()} bytes`);
  }
  
  /**
   * キャッシュをクリア
   */
  clear(): void {
    this.cache.clear();
  }
}

export const aggressiveCache = new AggressiveCache();

// グローバルに公開（開発環境のみ）
if (import.meta.env.DEV) {
  ((window as unknown) as { aggressiveCache: typeof aggressiveCache }).aggressiveCache = aggressiveCache;
  console.log('⚡ Aggressive cache loaded! Type aggressiveCache.getStats() to see performance.');
}