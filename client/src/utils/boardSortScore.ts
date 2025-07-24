import { ref, get, update } from "firebase/database";
import { rtdb } from "../config/firebase";

/**
 * ボードのソートスコアを計算
 * pinned boards: 9000000000000000 - pinnedAt (pinnedが上位、古くピンしたものが上位、最近ピンしたものが下位)
 * normal boards: 5000000000000000 + updatedAt (pinnedの下、新しいものが上位)
 * Firebase の limitToLast() で大きい値から取得
 */
export function calculateSortScore(
  isPinned: boolean,
  updatedAt: number,
  pinnedAt?: number
): number {
  if (isPinned || pinnedAt) {
    // pinnedAtがある場合はそれを使用、無い場合はupdatedAtで代用
    const pinTime = pinnedAt || updatedAt;
    return 9000000000000000 - pinTime; // ピンされたボードは一番上の範囲、古くピンしたものほど上位（最近ピンしたものが下）
  } else {
    return 5000000000000000 + updatedAt; // 通常ボードはピンの下の範囲、新しいものが上位（大きい値が上）
  }
}

/**
 * 特定のボードのsortScoreを更新
 */
export async function updateBoardSortScore(
  projectId: string,
  boardId: string,
  isPinned: boolean = false,
  updatedAt?: number,
  pinnedAt?: number
): Promise<void> {
  try {
    // updatedAtが指定されていない場合は現在の値を取得
    if (!updatedAt) {
      const boardRef = ref(
        rtdb,
        `projectBoards/${projectId}/${boardId}/updatedAt`
      );
      const snapshot = await get(boardRef);
      updatedAt = snapshot.val() || Date.now();
    }

    const sortScore = calculateSortScore(isPinned, updatedAt!, pinnedAt);

    const updates: Record<string, number> = {};
    updates[`projectBoards/${projectId}/${boardId}/sortScore`] = sortScore;

    await update(ref(rtdb), updates);
  } catch (error) {
    console.error(`❌ Error updating sortScore for ${boardId}:`, error);
    throw error;
  }
}

/**
 * プロジェクト内の全ボードのsortScoreを一括更新
 */
export async function updateAllBoardSortScores(
  projectId: string
): Promise<void> {
  try {
    const startTime = performance.now();

    // プロジェクト内の全ボードを取得
    const boardsRef = ref(rtdb, `projectBoards/${projectId}`);
    const snapshot = await get(boardsRef);

    if (!snapshot.exists()) {
      return;
    }

    const boards = snapshot.val();
    const updates: Record<string, number> = {};
    let updateCount = 0;

    // 各ボードのsortScoreを計算
    for (const [boardId, boardData] of Object.entries(boards)) {
      const board = boardData as any;
      const isPinned = board.isPinned || false;
      const updatedAt = board.updatedAt || board.createdAt || Date.now();
      const pinnedAt = board.pinnedAt;
      const sortScore = calculateSortScore(isPinned, updatedAt, pinnedAt);

      updates[`projectBoards/${projectId}/${boardId}/sortScore`] = sortScore;
      updateCount++;
    }

    if (updateCount > 0) {
      await update(ref(rtdb), updates);
    }
  } catch (error) {
    console.error("❌ Error updating board sort scores:", error);
    throw error;
  }
}

/**
 * sortScoreの状態を確認
 */
export async function checkSortScoreStatus(projectId: string): Promise<void> {
  try {
    const boardsRef = ref(rtdb, `projectBoards/${projectId}`);
    const snapshot = await get(boardsRef);

    if (!snapshot.exists()) {
      return;
    }

    const boards = snapshot.val();
    let withSortScore = 0;
    let withoutSortScore = 0;

    for (const [boardId, boardData] of Object.entries(boards)) {
      const board = boardData as any;
      const hasSortScore = board.sortScore !== undefined;

      if (hasSortScore) {
        withSortScore++;
      } else {
        withoutSortScore++;
      }
    }
  } catch (error) {
    console.error("❌ Error checking sort score status:", error);
  }
}
