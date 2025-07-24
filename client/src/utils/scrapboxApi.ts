/**
 * Scrapbox API utilities for searching page titles
 */

export interface ScrapboxSearchResult {
  title: string;
  url?: string;
  matches?: unknown;
}

// シンプルなメモリキャッシュ
const scrapboxCache = new Map<
  string,
  { data: ScrapboxSearchResult[]; timestamp: number }
>();
const CACHE_DURATION = 5 * 60 * 1000; // 5分

/**
 * Search page titles from Scrapbox project via Firebase Functions
 * @param projectName Scrapbox project name
 * @param query Search query
 * @returns Array of matching page titles
 */
export async function searchScrapboxTitles(
  projectName: string,
  query: string
): Promise<ScrapboxSearchResult[]> {
  if (!projectName || !query.trim()) {
    return [];
  }

  // キャッシュキーを作成
  const cacheKey = `${projectName}:${query}`;
  const cached = scrapboxCache.get(cacheKey);

  // キャッシュが有効な場合は返す
  if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
    return cached.data;
  }

  try {
    // Firebase Functions経由でScrapbox APIを呼び出し
    const encodedProjectName = encodeURIComponent(projectName);
    const encodedQuery = encodeURIComponent(query);

    // 本番環境とローカル開発環境で異なるベースURLを使用
    const isDevelopment = window.location.hostname === "localhost";
    const baseUrl = isDevelopment
      ? "http://127.0.0.1:5001/maplap-41b08/us-central1"
      : "https://us-central1-maplap-41b08.cloudfunctions.net";

    const url = `${baseUrl}/searchScrapboxTitles?projectName=${encodedProjectName}&q=${encodedQuery}`;

    const response = await fetch(url);

    if (!response.ok) {
      console.warn(
        `[Scrapbox API] Firebase Functions error: ${response.status} ${response.statusText}`
      );
      return [];
    }

    const data = await response.json();

    if (Array.isArray(data) && data.length > 0) {
      // Handle non-empty array if needed
    }

    // Scrapbox APIの実際のレスポンス形式に対応
    if (Array.isArray(data)) {
      const results = data
        .map((item) => {
          // itemが文字列の場合はそのまま使用
          if (typeof item === "string") {
            return {
              title: item,
              url: `https://scrapbox.io/${projectName}/${encodeURIComponent(
                item
              )}`,
            };
          }
          // itemがオブジェクトの場合はtitleプロパティを使用
          else if (
            typeof item === "object" &&
            item !== null &&
            "title" in item
          ) {
            return {
              title: String(item.title || ""),
              url: `https://scrapbox.io/${projectName}/${encodeURIComponent(
                item.title || ""
              )}`,
            };
          }
          // その他の場合は空文字列
          else {
            console.warn("[Scrapbox API] Unexpected item format:", item);
            return {
              title: "",
              url: `https://scrapbox.io/${projectName}/`,
            };
          }
        })
        .filter((result) => result.title); // 空のタイトルは除外

      // 結果をキャッシュに保存
      scrapboxCache.set(cacheKey, {
        data: results,
        timestamp: Date.now(),
      });

      return results;
    }

    console.warn("[Scrapbox API] Response is not an array:", typeof data);
    return [];
  } catch (error) {
    console.error("[Scrapbox API] Fetch error:", error);
    return [];
  }
}
