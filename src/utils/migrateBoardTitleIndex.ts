import { ref, get } from 'firebase/database';
import { rtdb } from '../config/firebase';
import { addBoardTitleIndex } from './boardTitleIndex';

/**
 * 既存のボードデータからタイトルインデックスを作成するマイグレーション処理
 */
export async function migrateBoardTitleIndex(): Promise<void> {
  console.log('Starting board title index migration...');
  
  try {
    // 全ボードを取得
    const boardsRef = ref(rtdb, 'boards');
    const boardsSnapshot = await get(boardsRef);
    const allBoards = boardsSnapshot.val() || {};
    
    let processedCount = 0;
    let errorCount = 0;
    
    // 各ボードのインデックスを作成
    for (const [boardId, boardData] of Object.entries(allBoards)) {
      try {
        const board = boardData as any;
        
        if (board.projectId && board.name) {
          await addBoardTitleIndex(board.projectId, boardId, board.name);
          processedCount++;
          
          if (processedCount % 50 === 0) {
            console.log(`Processed ${processedCount} boards...`);
          }
        }
      } catch (error) {
        console.error(`Error processing board ${boardId}:`, error);
        errorCount++;
      }
    }
    
    console.log(`Migration completed. Processed: ${processedCount}, Errors: ${errorCount}`);
  } catch (error) {
    console.error('Migration failed:', error);
    throw error;
  }
}

/**
 * 特定のプロジェクトのボードのみマイグレーション
 */
export async function migrateBoardTitleIndexForProject(projectId: string): Promise<void> {
  console.log(`Starting board title index migration for project: ${projectId}`);
  
  try {
    const boardsRef = ref(rtdb, 'boards');
    const boardsSnapshot = await get(boardsRef);
    const allBoards = boardsSnapshot.val() || {};
    
    let processedCount = 0;
    
    for (const [boardId, boardData] of Object.entries(allBoards)) {
      const board = boardData as any;
      
      if (board.projectId === projectId && board.name) {
        try {
          await addBoardTitleIndex(board.projectId, boardId, board.name);
          processedCount++;
        } catch (error) {
          console.error(`Error processing board ${boardId}:`, error);
        }
      }
    }
    
    console.log(`Project migration completed. Processed: ${processedCount} boards`);
  } catch (error) {
    console.error('Project migration failed:', error);
    throw error;
  }
}