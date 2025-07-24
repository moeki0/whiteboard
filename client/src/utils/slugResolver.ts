import { rtdb } from "../config/firebase";
import { ref, get, query, orderByChild, equalTo } from "firebase/database";
import { getBoardIdByTitle } from "./boardTitleIndex";
import { getProjectIdBySlug } from "./projectSlugIndex";

// メモリキャッシュ（セッション中のみ有効）
const projectSlugCache = new Map<string, string | null>();
const CACHE_TTL = 5 * 60 * 1000; // 5分
const cacheTimestamps = new Map<string, number>();

// LocalStorage永続キャッシュ
const STORAGE_KEY = "maplap_slug_cache";
const STORAGE_TIMESTAMPS_KEY = "maplap_slug_timestamps";

// LocalStorageからキャッシュを復元
function loadCacheFromStorage() {
  try {
    const cachedData = localStorage.getItem(STORAGE_KEY);
    const timestamps = localStorage.getItem(STORAGE_TIMESTAMPS_KEY);

    if (cachedData && timestamps) {
      const parsedCache = JSON.parse(cachedData);
      const parsedTimestamps = JSON.parse(timestamps);
      const now = Date.now();

      // 有効期限内のデータのみ復元
      for (const [slug, projectId] of Object.entries(parsedCache)) {
        const timestamp = parsedTimestamps[slug];
        if (timestamp && now - timestamp < CACHE_TTL) {
          projectSlugCache.set(slug, projectId as string);
          cacheTimestamps.set(slug, timestamp);
        }
      }
    }
  } catch (error) {
    console.warn("Failed to load cache from localStorage:", error);
  }
}

// LocalStorageにキャッシュを保存
function saveCacheToStorage() {
  try {
    const cacheObj = Object.fromEntries(projectSlugCache);
    const timestampObj = Object.fromEntries(cacheTimestamps);

    localStorage.setItem(STORAGE_KEY, JSON.stringify(cacheObj));
    localStorage.setItem(STORAGE_TIMESTAMPS_KEY, JSON.stringify(timestampObj));
  } catch (error) {
    console.warn("Failed to save cache to localStorage:", error);
  }
}

// 初期化時にキャッシュを復元
loadCacheFromStorage();

/**
 * Resolves a project slug to its ID by searching all projects
 */
export async function resolveProjectSlug(
  projectSlug: string
): Promise<string | null> {
  try {
    // キャッシュチェック（詳細ログ）
    const cached = projectSlugCache.get(projectSlug);
    const cacheTime = cacheTimestamps.get(projectSlug);
    const now = Date.now();

    if (cached !== undefined && cacheTime && now - cacheTime < CACHE_TTL) {
      return cached;
    }

    // First try the index for fast lookup
    const indexStart = performance.now();
    const projectIdFromIndex = await getProjectIdBySlug(projectSlug);

    if (projectIdFromIndex) {
      // キャッシュに保存
      const saveTime = Date.now();
      projectSlugCache.set(projectSlug, projectIdFromIndex);
      cacheTimestamps.set(projectSlug, saveTime);
      saveCacheToStorage(); // LocalStorageにも保存

      return projectIdFromIndex;
    }

    // Fallback to query (for projects without index)

    const queryStart = performance.now();
    const projectsRef = ref(rtdb, "projects");
    const projectQuery = query(
      projectsRef,
      orderByChild("slug"),
      equalTo(projectSlug)
    );
    const snapshot = await get(projectQuery);

    let result: string | null = null;
    if (snapshot.exists()) {
      const projects = snapshot.val();
      result = Object.keys(projects)[0];
    }

    // キャッシュに保存（結果がnullでも）
    const saveTime = Date.now();
    projectSlugCache.set(projectSlug, result);
    cacheTimestamps.set(projectSlug, saveTime);
    saveCacheToStorage(); // LocalStorageにも保存

    return result;
  } catch (error) {
    console.error("Error resolving project slug:", error);
    return null;
  }
}

/**
 * Resolves a board name to its ID within a specific project
 */
export async function resolveBoardName(
  projectId: string,
  boardName: string
): Promise<string | null> {
  try {
    // Use title index for fast lookup
    const boardId = await getBoardIdByTitle(projectId, boardName);
    if (boardId) {
      return boardId;
    }

    // Fallback: get all boards for the project (for boards without index)
    const projectBoardsRef = ref(rtdb, `projectBoards/${projectId}`);
    const projectBoardsSnapshot = await get(projectBoardsRef);

    if (!projectBoardsSnapshot.exists()) {
      return null;
    }

    const projectBoardsData = projectBoardsSnapshot.val();

    // Check each board name directly from projectBoards data
    for (const [boardId, boardData] of Object.entries(projectBoardsData)) {
      if ((boardData as any).name === boardName) {
        return boardId;
      }
    }

    return null;
  } catch (error) {
    console.error("Error resolving board name:", error);
    return null;
  }
}

/**
 * Resolves both project slug and board name to their respective IDs
 */
export async function resolveProjectAndBoardSlugs(
  projectSlug: string,
  boardName: string
): Promise<{ projectId: string | null; boardId: string | null }> {
  try {
    const projectId = await resolveProjectSlug(projectSlug);
    if (!projectId) {
      return { projectId: null, boardId: null };
    }

    const boardId = await resolveBoardName(projectId, boardName);
    return { projectId, boardId };
  } catch (error) {
    console.error("Error resolving project slug and board name:", error);
    return { projectId: null, boardId: null };
  }
}

/**
 * Resolves a project ID to its slug
 */
export async function resolveProjectIdToSlug(
  projectId: string
): Promise<string | null> {
  try {
    const projectRef = ref(rtdb, `projects/${projectId}/slug`);
    const snapshot = await get(projectRef);

    if (snapshot.exists()) {
      const slug = snapshot.val();
      // 空文字列の場合はnullを返す
      return slug && slug.trim() !== "" ? slug : null;
    }

    return null;
  } catch (error) {
    console.error("Error resolving project ID to slug:", error);
    return null;
  }
}

// キャッシュ状況を確認する関数
function checkSlugCache() {}

// グローバルに公開（開発環境のみ）
if (import.meta.env.DEV) {
  (window as any).slugCache = {
    check: checkSlugCache,
    clear: () => {
      projectSlugCache.clear();
      cacheTimestamps.clear();
    },
    ttl: CACHE_TTL,
  };
}
