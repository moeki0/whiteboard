import { ref, set, remove, get } from "firebase/database";
import { rtdb } from "../config/firebase";

// LocalStorage cache for board title index
const BOARD_TITLE_CACHE_KEY = 'maplap_board_title_index';
const BOARD_TITLE_CACHE_TTL_KEY = 'maplap_board_title_index_ttl';
const BOARD_TITLE_CACHE_TTL = 15 * 60 * 1000; // 15 minutes

// In-memory cache: projectId -> { normalizedTitle -> boardId }
const boardTitleCache = new Map<string, Map<string, string>>();
const boardTitleCacheTimestamps = new Map<string, number>();

// Load cache from LocalStorage
function loadBoardTitleCacheFromStorage() {
  try {
    const cachedData = localStorage.getItem(BOARD_TITLE_CACHE_KEY);
    const timestamps = localStorage.getItem(BOARD_TITLE_CACHE_TTL_KEY);
    
    if (cachedData && timestamps) {
      const parsedCache = JSON.parse(cachedData);
      const parsedTimestamps = JSON.parse(timestamps);
      const now = Date.now();
      
      // Restore valid entries
      for (const [projectId, titleMap] of Object.entries(parsedCache)) {
        const timestamp = parsedTimestamps[projectId];
        if (timestamp && now - timestamp < BOARD_TITLE_CACHE_TTL) {
          boardTitleCache.set(projectId, new Map(Object.entries(titleMap as Record<string, string>)));
          boardTitleCacheTimestamps.set(projectId, timestamp);
        }
      }
      
      console.log(`📋 Restored ${boardTitleCache.size} board title cache projects`);
    }
  } catch (error) {
    console.warn('Failed to load board title cache from localStorage:', error);
  }
}

// Save cache to LocalStorage
function saveBoardTitleCacheToStorage() {
  try {
    const cacheObj: Record<string, Record<string, string>> = {};
    for (const [projectId, titleMap] of boardTitleCache.entries()) {
      cacheObj[projectId] = Object.fromEntries(titleMap);
    }
    
    const timestampObj = Object.fromEntries(boardTitleCacheTimestamps);
    
    localStorage.setItem(BOARD_TITLE_CACHE_KEY, JSON.stringify(cacheObj));
    localStorage.setItem(BOARD_TITLE_CACHE_TTL_KEY, JSON.stringify(timestampObj));
  } catch (error) {
    console.warn('Failed to save board title cache to localStorage:', error);
  }
}

// Initialize cache on module load
loadBoardTitleCacheFromStorage();

/**
 * ボードタイトルを正規化（検索用）
 */
export function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/\s+/g, "") // 空白を削除
    .replace(/[^\w\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/g, ""); // 英数字・ひらがな・カタカナ・漢字のみ
}

/**
 * ボードタイトルインデックスに追加
 */
export async function addBoardTitleIndex(
  projectId: string,
  boardId: string,
  title: string
): Promise<void> {
  const normalizedTitle = normalizeTitle(title);
  if (!normalizedTitle) return; // 空文字の場合はインデックス作成しない

  // Untitled(_N)パターンはインデックスに追加しない（自動生成されたタイトルのため）
  if (title.match(/^Untitled(_\d+)?$/)) {
    console.log(`📋 Skipping index for auto-generated title: ${title}`);
    return;
  }

  const indexRef = ref(rtdb, `boardTitleIndex/${projectId}/${normalizedTitle}`);
  await set(indexRef, boardId);
}

/**
 * ボードタイトルインデックスから削除
 */
export async function removeBoardTitleIndex(
  projectId: string,
  title: string
): Promise<void> {
  const normalizedTitle = normalizeTitle(title);
  if (!normalizedTitle) return;

  const indexRef = ref(rtdb, `boardTitleIndex/${projectId}/${normalizedTitle}`);
  await remove(indexRef);
  
  // Untitledパターンの削除をログ出力
  if (title.match(/^Untitled(_\d+)?$/)) {
    console.log(`📋 Removing index for auto-generated title: ${title}`);
  }
}

/**
 * ボードタイトルからboardIdを取得
 */
export async function getBoardIdByTitle(
  projectId: string,
  title: string
): Promise<string | null> {
  const normalizedTitle = normalizeTitle(title);
  if (!normalizedTitle) return null;

  // Untitled(_N)パターンはインデックス検索をスキップ（リダイレクトを防ぐため）
  if (title.match(/^Untitled(_\d+)?$/)) {
    console.log(`📋 Skipping index lookup for auto-generated title: ${title}`);
    return null;
  }

  // Check cache first
  const projectCache = boardTitleCache.get(projectId);
  const cacheTime = boardTitleCacheTimestamps.get(projectId);
  const now = Date.now();
  
  if (projectCache && cacheTime && now - cacheTime < BOARD_TITLE_CACHE_TTL) {
    const cachedBoardId = projectCache.get(normalizedTitle);
    if (cachedBoardId !== undefined) {
      console.log(`📋 Board title cache hit: ${title} -> ${cachedBoardId}`);
      return cachedBoardId || null;
    }
  }

  // Cache miss - fetch from Firebase
  const startTime = performance.now();
  const indexRef = ref(rtdb, `boardTitleIndex/${projectId}/${normalizedTitle}`);
  const snapshot = await get(indexRef);
  const boardId = snapshot.val() || null;
  
  console.log(`📋 Board title fetch took: ${(performance.now() - startTime).toFixed(2)}ms`);

  // Update cache
  if (!boardTitleCache.has(projectId)) {
    boardTitleCache.set(projectId, new Map());
  }
  
  const projectMap = boardTitleCache.get(projectId)!;
  projectMap.set(normalizedTitle, boardId);
  boardTitleCacheTimestamps.set(projectId, now);
  saveBoardTitleCacheToStorage();
  
  console.log(`📋 Cached board title: ${title} -> ${boardId} for project ${projectId}`);
  return boardId;
}

/**
 * 既存のボードタイトルインデックスを更新（タイトル変更時）
 */
export async function updateBoardTitleIndex(
  projectId: string,
  boardId: string,
  oldTitle: string,
  newTitle: string
): Promise<void> {
  // 古いインデックスを削除（Untitledパターンでも削除は実行）
  await removeBoardTitleIndex(projectId, oldTitle);

  // 新しいインデックスを追加（addBoardTitleIndex内でUntitledパターンはスキップされる）
  await addBoardTitleIndex(projectId, boardId, newTitle);
  
  // Update cache - remove old entry and add new one
  const projectCache = boardTitleCache.get(projectId);
  if (projectCache) {
    const oldNormalizedTitle = normalizeTitle(oldTitle);
    const newNormalizedTitle = normalizeTitle(newTitle);
    
    projectCache.delete(oldNormalizedTitle);
    if (newNormalizedTitle) {
      projectCache.set(newNormalizedTitle, boardId);
    }
    
    boardTitleCacheTimestamps.set(projectId, Date.now());
    saveBoardTitleCacheToStorage();
    
    console.log(`📋 Updated board title cache: ${oldTitle} -> ${newTitle}`);
  }
}

// Cache management functions for development
function clearBoardTitleCache() {
  boardTitleCache.clear();
  boardTitleCacheTimestamps.clear();
  localStorage.removeItem(BOARD_TITLE_CACHE_KEY);
  localStorage.removeItem(BOARD_TITLE_CACHE_TTL_KEY);
  console.log('📋 Board title cache cleared');
}

function checkBoardTitleCacheStatus() {
  console.log('📋 Board title cache status:');
  console.log('Cached projects:', boardTitleCache.size);
  
  for (const [projectId, titleMap] of boardTitleCache.entries()) {
    console.log(`  Project ${projectId}: ${titleMap.size} titles`);
    for (const [title, boardId] of titleMap.entries()) {
      console.log(`    ${title} -> ${boardId}`);
    }
  }
  
  console.log('Timestamps:', Object.fromEntries(boardTitleCacheTimestamps));
  console.log('TTL:', BOARD_TITLE_CACHE_TTL, 'ms');
}

// Export cache management tools in development
if (import.meta.env.DEV) {
  (window as any).boardTitleCache = {
    check: checkBoardTitleCacheStatus,
    clear: clearBoardTitleCache,
    ttl: BOARD_TITLE_CACHE_TTL
  };

  console.log('📋 Board title cache tools loaded! Commands:');
  console.log('  boardTitleCache.check() - Check cache status');
  console.log('  boardTitleCache.clear() - Clear cache');
}
