import {
  ref,
  get,
  query,
  orderByChild,
  limitToFirst,
  limitToLast,
  startAfter,
  endBefore,
} from "firebase/database";
import { rtdb } from "../config/firebase";
import { getPaginatedBoards } from "./boardDataOptimizer";

/**
 * 真のページネーション - 必要な分だけ取得
 */

interface PaginationCursor {
  lastKey: string;
  lastValue: number;
  direction: "forward" | "backward";
}

interface TruePaginatedResult<T> {
  items: T[];
  totalCount?: number;
  hasNext: boolean;
  hasPrev: boolean;
  nextCursor?: PaginationCursor;
  prevCursor?: PaginationCursor;
  queryTime: number;
}

/**
 * Firebase Realtime Databaseで真のページネーションを実現
 * sortIndexを使って効率的にページング
 */
export async function getTruePaginatedBoards(
  projectId: string,
  itemsPerPage: number = 14,
  cursor?: PaginationCursor
): Promise<TruePaginatedResult<unknown>> {
  const startTime = performance.now();

  try {
    // sortScoreを使った真のページネーション
    const boardsRef = ref(rtdb, `projectBoards/${projectId}`);
    let boardsQuery;

    if (!cursor) {
      // 最初のページ: sortScoreの昇順で最後のN件（小さい値=新しいボード）
      boardsQuery = query(
        boardsRef,
        orderByChild("sortScore"),
        limitToLast(itemsPerPage + 1) // +1で次ページの存在確認
      );
    } else if (cursor.direction === "forward") {
      // 次のページ（より大きい値=古いボード）
      boardsQuery = query(
        boardsRef,
        orderByChild("sortScore"),
        endBefore(cursor.lastValue),
        limitToLast(itemsPerPage + 1)
      );
    } else {
      // 前のページ（より小さい値=新しいボード）
      boardsQuery = query(
        boardsRef,
        orderByChild("sortScore"),
        startAfter(cursor.lastValue),
        limitToFirst(itemsPerPage + 1)
      );
    }

    const snapshot = await get(boardsQuery);
    const queryTime = performance.now();

    console.log(
      `⚡ TRUE pagination query: ${(queryTime - startTime).toFixed(2)}ms`
    );

    if (!snapshot.exists()) {
      return {
        items: [],
        hasNext: false,
        hasPrev: false,
        queryTime: queryTime - startTime,
      };
    }

    const boardsData = snapshot.val();
    let boardsArray = Object.entries(boardsData).map(
      ([id, data]: [string, any]) => ({
        id,
        ...data,
      })
    );

    // sortScoreの降順でソート（既にFirebase側でソートされているが念のため）
    console.log(`📊 Raw boards data (first 3):`, boardsArray.slice(0, 3).map(b => ({
      name: b.name,
      isPinned: b.isPinned,
      updatedAt: b.updatedAt,
      sortScore: b.sortScore,
      calculatedScore: b.sortScore || 'MISSING'
    })));
    
    // sortScoreベースでソート（Firebase は昇順で返すため、JavaScript で降順に並び替え）
    boardsArray.sort((a, b) => {
      const scoreA = a.sortScore;
      const scoreB = b.sortScore;
      
      // 両方にsortScoreがある場合は降順ソート（大きい値が上）  
      if (scoreA !== undefined && scoreB !== undefined) {
        return scoreB - scoreA;
      }
      
      // sortScoreが無い場合はupdatedAtベースでフォールバック
      if (!scoreA && !scoreB) {
        // pinned優先、その後updatedAtで降順
        if (a.isPinned && !b.isPinned) return -1;
        if (!a.isPinned && b.isPinned) return 1;
        const aTime = a.updatedAt || a.createdAt || 0;
        const bTime = b.updatedAt || b.createdAt || 0;
        return bTime - aTime;
      }
      
      // 片方だけsortScoreがある場合、それを優先
      if (scoreA && !scoreB) return -1;
      if (!scoreA && scoreB) return 1;
      
      return 0;
    });
    
    console.log(`📊 After sorting (first 3):`, boardsArray.slice(0, 3).map(b => ({
      name: b.name,
      isPinned: b.isPinned,
      updatedAt: b.updatedAt,
      sortScore: b.sortScore
    })));

    // +1で取得した場合の調整
    const hasNext = boardsArray.length > itemsPerPage;
    const hasPrev = !!cursor;

    if (hasNext) {
      boardsArray = boardsArray.slice(0, itemsPerPage);
    }

    // カーソル情報を設定
    let nextCursor: PaginationCursor | undefined;
    let prevCursor: PaginationCursor | undefined;

    if (hasNext && boardsArray.length > 0) {
      const lastItem = boardsArray[boardsArray.length - 1];
      nextCursor = {
        lastKey: lastItem.id,
        lastValue: lastItem.sortScore || 0,
        direction: "forward",
      };
    }

    if (hasPrev && boardsArray.length > 0) {
      const firstItem = boardsArray[0];
      prevCursor = {
        lastKey: firstItem.id,
        lastValue: firstItem.sortScore || 0,
        direction: "backward",
      };
    }

    const endTime = performance.now();
    console.log(
      `⚡ TRUE pagination total: ${(endTime - startTime).toFixed(2)}ms`
    );

    return {
      items: boardsArray,
      hasNext,
      hasPrev,
      nextCursor,
      prevCursor,
      queryTime: endTime - startTime,
    };
  } catch (error) {
    console.error("True pagination failed:", error);

    // sortScoreエラーの場合、フォールバックを使用
    if (error instanceof Error && error.message.includes("Index not defined")) {
      console.warn("🔄 Falling back to old structure due to missing sortScore index");
      return await getFallbackPagination(projectId, itemsPerPage, cursor);
    }

    throw error;
  }
}

/**
 * プロジェクトのボードにsortScoreが設定されているかチェックし、必要に応じて自動設定
 */
export async function ensureSortScoresForProject(projectId: string): Promise<void> {
  try {
    const boardsRef = ref(rtdb, `projectBoards/${projectId}`);
    const snapshot = await get(boardsRef);
    
    if (!snapshot.exists()) return;
    
    const boards = snapshot.val();
    const updates: Record<string, number> = {};
    let missingCount = 0;
    
    for (const [boardId, boardData] of Object.entries(boards)) {
      const board = boardData as any;
      
      // sortScoreが無い場合のみ設定
      if (board.sortScore === undefined) {
        const isPinned = board.isPinned || false;
        const updatedAt = board.updatedAt || board.createdAt || Date.now();
        const base = isPinned ? 2000000000000 : 1000000000000;
        const sortScore = base - updatedAt;
        
        updates[`projectBoards/${projectId}/${boardId}/sortScore`] = sortScore;
        missingCount++;
      }
    }
    
    if (missingCount > 0) {
      console.log(`🔧 Auto-setting sortScore for ${missingCount} boards in project ${projectId}`);
      const { update } = await import('firebase/database');
      await update(ref(rtdb), updates);
      console.log(`✅ Successfully set sortScore for ${missingCount} boards`);
    }
    
  } catch (error) {
    console.error('Error ensuring sort scores:', error);
  }
}

/**
 * フォールバック: 古い構造を使用した疑似ページネーション
 */
async function getFallbackPagination(
  projectId: string,
  itemsPerPage: number,
  cursor?: PaginationCursor
): Promise<TruePaginatedResult<any>> {
  const startTime = performance.now();

  try {
    // projectBoardsから直接取得してページング
    const boardsRef = ref(rtdb, `projectBoards/${projectId}`);
    const snapshot = await get(boardsRef);
    
    if (!snapshot.exists()) {
      return {
        items: [],
        hasNext: false,
        hasPrev: false,
        queryTime: performance.now() - startTime,
      };
    }
    
    const boardsData = snapshot.val();
    let boardsArray = Object.entries(boardsData).map(
      ([id, data]: [string, any]) => ({
        id,
        ...data,
      })
    );
    
    // pinned優先、その後updatedAtで降順ソート
    boardsArray.sort((a, b) => {
      if (a.isPinned && !b.isPinned) return -1;
      if (!a.isPinned && b.isPinned) return 1;
      const aTime = a.updatedAt || a.createdAt || 0;
      const bTime = b.updatedAt || b.createdAt || 0;
      return bTime - aTime;
    });

    const queryTime = performance.now();
    console.log(`🔄 Fallback query: ${(queryTime - startTime).toFixed(2)}ms`);

    // カーソルベースのフィルタリング（簡易版）
    let boards = boardsArray;

    if (cursor) {
      const cursorIndex = boards.findIndex((b) => b.id === cursor.lastKey);
      if (cursorIndex >= 0) {
        if (cursor.direction === "forward") {
          boards = boards.slice(cursorIndex + 1);
        } else {
          boards = boards.slice(0, cursorIndex);
        }
      }
    }

    // ページサイズに制限
    const hasNext = boards.length > itemsPerPage;
    const items = boards.slice(0, itemsPerPage);

    // 次のカーソルを設定
    let nextCursor: PaginationCursor | undefined;
    if (hasNext && items.length > 0) {
      const lastItem = items[items.length - 1];
      nextCursor = {
        lastKey: lastItem.id,
        lastValue: lastItem.updatedAt || 0,
        direction: "forward",
      };
    }

    const endTime = performance.now();
    console.log(`🔄 Fallback total: ${(endTime - startTime).toFixed(2)}ms`);

    return {
      items,
      hasNext,
      hasPrev: !!cursor,
      nextCursor,
      queryTime: endTime - startTime,
    };
  } catch (error) {
    console.error("Fallback pagination failed:", error);
    throw error;
  }
}

/**
 * カウント専用クエリ（軽量）
 */
export async function getBoardCount(projectId: string): Promise<number> {
  try {
    const countRef = ref(rtdb, `projectBoardsCount/${projectId}`);
    const snapshot = await get(countRef);

    if (snapshot.exists()) {
      return snapshot.val();
    }

    // フォールバック: 実際にカウント
    const boardsRef = ref(rtdb, `projectBoardsList/${projectId}`);
    const boardsSnapshot = await get(boardsRef);

    if (!boardsSnapshot.exists()) {
      return 0;
    }

    const count = Object.keys(boardsSnapshot.val()).length;

    // カウントをキャッシュ
    const updates: Record<string, number> = {};
    updates[`projectBoardsCount/${projectId}`] = count;

    return count;
  } catch (error) {
    console.error("Failed to get board count:", error);
    return 0;
  }
}

/**
 * ページ番号ベースのインターフェース（従来互換）
 */
export async function getPageBasedBoards(
  projectId: string,
  page: number = 1,
  itemsPerPage: number = 14
) {
  // TODO: カーソルベースの実装をページ番号ベースに変換
  // 現時点では全件取得より高速な部分実装

  if (page === 1) {
    return getTruePaginatedBoards(projectId, itemsPerPage);
  }

  // 2ページ目以降は一旦全件取得（将来的に改善予定）
  console.warn(
    "⚠️  Page > 1 still uses full query. Implementing cursor-based page mapping..."
  );

  const boardsRef = ref(rtdb, `projectBoardsList/${projectId}`);
  const snapshot = await get(boardsRef);

  if (!snapshot.exists()) {
    return {
      items: [],
      hasNext: false,
      hasPrev: false,
      queryTime: 0,
    };
  }

  const boardsData = snapshot.val();
  const boardsArray = Object.entries(boardsData).map(
    ([id, data]: [string, any]) => ({
      id,
      ...data,
    })
  );

  boardsArray.sort((a, b) => (b.sortIndex || 0) - (a.sortIndex || 0));

  const startIndex = (page - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const pageItems = boardsArray.slice(startIndex, endIndex);

  return {
    items: pageItems,
    hasNext: endIndex < boardsArray.length,
    hasPrev: page > 1,
    queryTime: 0,
  };
}

/**
 * 開発用: プロジェクトの全ボードのsortScoreをクリアして再計算
 */
export async function resetAllSortScores(projectId: string): Promise<void> {
  try {
    const boardsRef = ref(rtdb, `projectBoards/${projectId}`);
    const snapshot = await get(boardsRef);
    
    if (!snapshot.exists()) return;
    
    const boards = snapshot.val();
    const updates: Record<string, number | null> = {};
    
    // まず全てのsortScoreを削除
    for (const [boardId] of Object.entries(boards)) {
      updates[`projectBoards/${projectId}/${boardId}/sortScore`] = null;
    }
    
    console.log(`🔄 Clearing all sortScores for project ${projectId}...`);
    const { update } = await import('firebase/database');
    await update(ref(rtdb), updates);
    
    // 次に新しいsortScoreを設定
    await ensureSortScoresForProject(projectId);
    
    console.log(`✅ Reset complete! Refresh the page to see new ordering.`);
    
  } catch (error) {
    console.error('Error resetting sort scores:', error);
  }
}

// グローバルに公開（開発環境のみ）
if (import.meta.env.DEV) {
  (window as any).truePagination = {
    getTruePaginatedBoards,
    getBoardCount,
    getPageBasedBoards,
    ensureSortScoresForProject,
    resetAllSortScores,
  };

  console.log(
    "⚡ True pagination loaded! First page will only fetch 14 items instead of 67!"
  );
  console.log("  ensureSortScoresForProject(projectId) - Auto-set missing sortScores");
  console.log("  resetAllSortScores(projectId) - Clear and recalculate all sortScores");
}
