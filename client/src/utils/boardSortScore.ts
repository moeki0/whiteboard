import { ref, get, update } from 'firebase/database';
import { rtdb } from '../config/firebase';

/**
 * ボードのソートスコアを計算
 * pinned boards: 3000000000000 + updatedAt (最上位、新しい順)
 * normal boards: updatedAt (新しい順)
 * Firebase の limitToLast() で大きい値から取得
 */
export function calculateSortScore(isPinned: boolean, updatedAt: number): number {
  if (isPinned) {
    return 3000000000000 + updatedAt; // pinnedは最も大きい値の範囲
  } else {
    return updatedAt; // normalは updatedAt そのまま
  }
}

/**
 * 特定のボードのsortScoreを更新
 */
export async function updateBoardSortScore(
  projectId: string, 
  boardId: string, 
  isPinned: boolean = false, 
  updatedAt?: number
): Promise<void> {
  try {
    // updatedAtが指定されていない場合は現在の値を取得
    if (!updatedAt) {
      const boardRef = ref(rtdb, `projectBoards/${projectId}/${boardId}/updatedAt`);
      const snapshot = await get(boardRef);
      updatedAt = snapshot.val() || Date.now();
    }
    
    const sortScore = calculateSortScore(isPinned, updatedAt!);
    
    const updates: Record<string, number> = {};
    updates[`projectBoards/${projectId}/${boardId}/sortScore`] = sortScore;
    
    await update(ref(rtdb), updates);
    console.log(`✅ Updated sortScore for ${boardId}: ${sortScore} (pinned: ${isPinned})`);
  } catch (error) {
    console.error(`❌ Error updating sortScore for ${boardId}:`, error);
    throw error;
  }
}

/**
 * プロジェクト内の全ボードのsortScoreを一括更新
 */
export async function updateAllBoardSortScores(projectId: string): Promise<void> {
  try {
    console.log(`🔧 Updating all board sort scores for project ${projectId}...`);
    const startTime = performance.now();
    
    // プロジェクト内の全ボードを取得
    const boardsRef = ref(rtdb, `projectBoards/${projectId}`);
    const snapshot = await get(boardsRef);
    
    if (!snapshot.exists()) {
      console.log('❌ No boards found');
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
      const sortScore = calculateSortScore(isPinned, updatedAt);
      
      updates[`projectBoards/${projectId}/${boardId}/sortScore`] = sortScore;
      updateCount++;
      
      console.log(`📊 ${board.name}: sortScore=${sortScore} (pinned=${isPinned}, updatedAt=${updatedAt})`);
    }
    
    if (updateCount > 0) {
      // バッチで更新
      await update(ref(rtdb), updates);
      console.log(`✅ Updated ${updateCount} board sort scores in ${(performance.now() - startTime).toFixed(2)}ms`);
    } else {
      console.log('⚠️ No boards to update');
    }
    
  } catch (error) {
    console.error('❌ Error updating board sort scores:', error);
    throw error;
  }
}

/**
 * sortScoreの状態を確認
 */
export async function checkSortScoreStatus(projectId: string): Promise<void> {
  try {
    console.log(`🔍 Checking sort score status for project ${projectId}...`);
    
    const boardsRef = ref(rtdb, `projectBoards/${projectId}`);
    const snapshot = await get(boardsRef);
    
    if (!snapshot.exists()) {
      console.log('❌ No boards found');
      return;
    }
    
    const boards = snapshot.val();
    let withSortScore = 0;
    let withoutSortScore = 0;
    
    console.log('📊 Board sort score status:');
    for (const [boardId, boardData] of Object.entries(boards)) {
      const board = boardData as any;
      const hasSortScore = board.sortScore !== undefined;
      
      if (hasSortScore) {
        withSortScore++;
      } else {
        withoutSortScore++;
        console.log(`  ❌ ${board.name} (${boardId}) - No sortScore`);
      }
    }
    
    console.log(`📈 Summary: ${withSortScore} with sortScore, ${withoutSortScore} without`);
    
    if (withoutSortScore > 0) {
      console.log('💡 Run updateAllBoardSortScores() to fix missing sortScores');
    }
    
  } catch (error) {
    console.error('❌ Error checking sort score status:', error);
  }
}

// 開発環境でグローバルに公開
if (import.meta.env.DEV) {
  (window as any).boardSortScore = {
    update: updateBoardSortScore,
    updateAll: updateAllBoardSortScores,
    check: checkSortScoreStatus,
    calculate: calculateSortScore,
  };
  
  console.log('🔧 Board sort score tools loaded! Commands:');
  console.log('  boardSortScore.check(projectId)  - Check current status');
  console.log('  boardSortScore.updateAll(projectId) - Update all boards');
  console.log('  boardSortScore.update(projectId, boardId, isPinned, updatedAt) - Update single board');
}