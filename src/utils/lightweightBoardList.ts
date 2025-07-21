import { ref, get, set, update } from "firebase/database";
import { rtdb } from "../config/firebase";

/**
 * 超軽量なボードリスト専用データ構造
 * 必要最小限の情報のみを保存して高速化
 */
export interface LightweightBoard {
  id: string;
  name: string;
  title: string;
  updatedAt: number;
  isPinned: boolean;
  // 重いデータは除外: description, thumbnailUrl, metadata
}

/**
 * 超軽量ボードリストを取得（50ms以下目標）
 */
export async function getLightweightBoardsList(
  projectId: string,
  page: number = 1,
  itemsPerPage: number = 14
): Promise<{
  boards: LightweightBoard[];
  totalCount: number;
  allBoardIds: string[];
}> {
  const startTime = performance.now();
  
  try {
    const lightweightRef = ref(rtdb, `lightweightBoardsList/${projectId}`);
    const snapshot = await get(lightweightRef);
    
    const queryTime = performance.now();
    console.log(`⚡ Lightweight query: ${(queryTime - startTime).toFixed(2)}ms`);
    
    if (!snapshot.exists()) {
      return { boards: [], totalCount: 0, allBoardIds: [] };
    }
    
    const boardsData = snapshot.val() as Record<string, LightweightBoard>;
    
    // ソート（sortIndexを事前計算しているので高速）
    const boardsArray = Object.values(boardsData).sort((a, b) => {
      if (a.isPinned && !b.isPinned) return -1;
      if (!a.isPinned && b.isPinned) return 1;
      return b.updatedAt - a.updatedAt;
    });
    
    const processingTime = performance.now();
    console.log(`⚡ Processing: ${(processingTime - queryTime).toFixed(2)}ms`);
    
    const allBoardIds = boardsArray.map(b => b.id);
    
    // ページネーション
    const startIndex = (page - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const paginatedBoards = boardsArray.slice(startIndex, endIndex);
    
    const endTime = performance.now();
    console.log(`⚡ Total lightweight: ${(endTime - startTime).toFixed(2)}ms`);
    
    return {
      boards: paginatedBoards,
      totalCount: boardsArray.length,
      allBoardIds
    };
  } catch (error) {
    console.error('Lightweight query failed:', error);
    throw error;
  }
}

/**
 * 軽量データ構造を更新
 */
export async function updateLightweightBoard(
  projectId: string,
  boardId: string,
  boardData: { 
    name: string;
    title?: string;
    updatedAt?: number;
    isPinned?: boolean;
  }
): Promise<void> {
  try {
    const lightweightRef = ref(rtdb, `lightweightBoardsList/${projectId}/${boardId}`);
    
    const lightweightBoard: LightweightBoard = {
      id: boardId,
      name: boardData.name,
      title: boardData.title || boardData.name,
      updatedAt: boardData.updatedAt || Date.now(),
      isPinned: boardData.isPinned || false
    };
    
    await set(lightweightRef, lightweightBoard);
  } catch (error) {
    console.warn('Failed to update lightweight board:', error);
  }
}

/**
 * 既存データから軽量データ構造を生成
 */
export async function generateLightweightStructure(projectId: string): Promise<void> {
  try {
    console.log(`⚡ Generating lightweight structure for ${projectId}...`);
    
    // 既存の新構造から軽量版を生成
    const fullRef = ref(rtdb, `projectBoardsList/${projectId}`);
    const snapshot = await get(fullRef);
    
    if (!snapshot.exists()) {
      console.log('No boards found to convert');
      return;
    }
    
    const fullData = snapshot.val();
    const updates: Record<string, LightweightBoard> = {};
    
    Object.entries(fullData).forEach(([boardId, boardData]: [string, any]) => {
      updates[`lightweightBoardsList/${projectId}/${boardId}`] = {
        id: boardId,
        name: boardData.name,
        title: boardData.title || boardData.name,
        updatedAt: boardData.updatedAt || boardData.createdAt,
        isPinned: boardData.isPinned || false
      };
    });
    
    await update(ref(rtdb), updates);
    console.log(`⚡ Generated lightweight structure with ${Object.keys(fullData).length} boards`);
  } catch (error) {
    console.error('Failed to generate lightweight structure:', error);
    throw error;
  }
}