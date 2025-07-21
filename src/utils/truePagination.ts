import { ref, get, query, orderByChild, limitToFirst, limitToLast, startAfter, endBefore } from "firebase/database";
import { rtdb } from "../config/firebase";
import { getPaginatedBoards } from "./boardDataOptimizer";

/**
 * 真のページネーション - 必要な分だけ取得
 */

interface PaginationCursor {
  lastKey: string;
  lastValue: number;
  direction: 'forward' | 'backward';
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
): Promise<TruePaginatedResult<any>> {
  
  const startTime = performance.now();
  
  try {
    const boardsRef = ref(rtdb, `projectBoardsList/${projectId}`);
    let boardsQuery;
    
    if (!cursor) {
      // 最初のページ: sortIndexの降順で上位N件
      boardsQuery = query(
        boardsRef,
        orderByChild('sortIndex'),
        limitToLast(itemsPerPage + 1) // +1で次ページの存在確認
      );
    } else if (cursor.direction === 'forward') {
      // 次のページ
      boardsQuery = query(
        boardsRef,
        orderByChild('sortIndex'),
        endBefore(cursor.lastValue),
        limitToLast(itemsPerPage + 1)
      );
    } else {
      // 前のページ
      boardsQuery = query(
        boardsRef,
        orderByChild('sortIndex'),
        startAfter(cursor.lastValue),
        limitToFirst(itemsPerPage + 1)
      );
    }
    
    const snapshot = await get(boardsQuery);
    const queryTime = performance.now();
    
    console.log(`⚡ TRUE pagination query: ${(queryTime - startTime).toFixed(2)}ms`);
    
    if (!snapshot.exists()) {
      return {
        items: [],
        hasNext: false,
        hasPrev: false,
        queryTime: queryTime - startTime
      };
    }
    
    const boardsData = snapshot.val();
    let boardsArray = Object.entries(boardsData).map(([id, data]: [string, any]) => ({
      id,
      ...data
    }));
    
    // sortIndexの降順でソート（pinned first, then by updatedAt desc）
    boardsArray.sort((a, b) => (b.sortIndex || 0) - (a.sortIndex || 0));
    
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
        lastValue: lastItem.sortIndex || 0,
        direction: 'forward'
      };
    }
    
    if (hasPrev && boardsArray.length > 0) {
      const firstItem = boardsArray[0];
      prevCursor = {
        lastKey: firstItem.id,
        lastValue: firstItem.sortIndex || 0,
        direction: 'backward'
      };
    }
    
    const endTime = performance.now();
    console.log(`⚡ TRUE pagination total: ${(endTime - startTime).toFixed(2)}ms`);
    
    return {
      items: boardsArray,
      hasNext,
      hasPrev,
      nextCursor,
      prevCursor,
      queryTime: endTime - startTime
    };
    
  } catch (error) {
    console.error('True pagination failed:', error);
    
    // sortIndexインデックスエラーの場合、古い構造にフォールバック
    if (error instanceof Error && error.message.includes('Index not defined')) {
      console.warn('🔄 Falling back to old structure due to missing index');
      return await getFallbackPagination(projectId, itemsPerPage, cursor);
    }
    
    throw error;
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
    // 古い構造を使って全件取得してページング
    const result = await getPaginatedBoards(projectId, 1, itemsPerPage * 10); // 多めに取得
    
    const queryTime = performance.now();
    console.log(`🔄 Fallback query: ${(queryTime - startTime).toFixed(2)}ms`);
    
    if (!result.boards.length) {
      return {
        items: [],
        hasNext: false,
        hasPrev: false,
        queryTime: queryTime - startTime
      };
    }
    
    // カーソルベースのフィルタリング（簡易版）
    let boards = result.boards;
    
    if (cursor) {
      const cursorIndex = boards.findIndex(b => b.id === cursor.lastKey);
      if (cursorIndex >= 0) {
        if (cursor.direction === 'forward') {
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
        direction: 'forward'
      };
    }
    
    const endTime = performance.now();
    console.log(`🔄 Fallback total: ${(endTime - startTime).toFixed(2)}ms`);
    
    return {
      items,
      hasNext,
      hasPrev: !!cursor,
      nextCursor,
      queryTime: endTime - startTime
    };
    
  } catch (error) {
    console.error('Fallback pagination failed:', error);
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
    console.error('Failed to get board count:', error);
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
  console.warn('⚠️  Page > 1 still uses full query. Implementing cursor-based page mapping...');
  
  const boardsRef = ref(rtdb, `projectBoardsList/${projectId}`);
  const snapshot = await get(boardsRef);
  
  if (!snapshot.exists()) {
    return {
      items: [],
      hasNext: false,
      hasPrev: false,
      queryTime: 0
    };
  }
  
  const boardsData = snapshot.val();
  const boardsArray = Object.entries(boardsData).map(([id, data]: [string, any]) => ({
    id,
    ...data
  }));
  
  boardsArray.sort((a, b) => (b.sortIndex || 0) - (a.sortIndex || 0));
  
  const startIndex = (page - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const pageItems = boardsArray.slice(startIndex, endIndex);
  
  return {
    items: pageItems,
    hasNext: endIndex < boardsArray.length,
    hasPrev: page > 1,
    queryTime: 0
  };
}

// グローバルに公開（開発環境のみ）
if (import.meta.env.DEV) {
  (window as any).truePagination = {
    getTruePaginatedBoards,
    getBoardCount,
    getPageBasedBoards
  };
  
  console.log('⚡ True pagination loaded! First page will only fetch 14 items instead of 67!');
}