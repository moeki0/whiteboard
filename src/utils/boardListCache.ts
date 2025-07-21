import { Board } from "../types";

interface CacheEntry {
  data: any;
  timestamp: number;
  ttl: number;
}

class BoardListCache {
  private cache: Map<string, CacheEntry> = new Map();
  private readonly DEFAULT_TTL = 60000; // 1 minute

  set(key: string, data: any, ttl: number = this.DEFAULT_TTL): void {
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl
    });
  }

  get(key: string): any | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    const now = Date.now();
    if (now - entry.timestamp > entry.ttl) {
      this.cache.delete(key);
      return null;
    }

    return entry.data;
  }

  invalidate(pattern?: string): void {
    if (!pattern) {
      this.cache.clear();
      return;
    }

    for (const key of this.cache.keys()) {
      if (key.includes(pattern)) {
        this.cache.delete(key);
      }
    }
  }

  // Get cache key for board list
  getBoardListKey(projectId: string, page: number): string {
    return `boardList:${projectId}:page:${page}`;
  }

  // Get cache key for project boards
  getProjectBoardsKey(projectId: string): string {
    return `projectBoards:${projectId}`;
  }
}

export const boardListCache = new BoardListCache();