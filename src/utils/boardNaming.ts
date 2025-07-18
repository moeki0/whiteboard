import { rtdb } from "../config/firebase";
import { ref, get } from "firebase/database";
import { Board } from "../types";
import { getBoardIdByTitle } from "./boardTitleIndex";

// 作成したばかりのボードを一時的にキャッシュ（タイトルインデックスの遅延対策）
const recentlyCreatedBoards = new Map<string, { boardId: string; timestamp: number }>();

// キャッシュエントリを追加
export const addToRecentlyCreated = (projectId: string, boardName: string, boardId: string) => {
  const key = `${projectId}:${boardName}`;
  recentlyCreatedBoards.set(key, { boardId, timestamp: Date.now() });
  
  // 5秒後にキャッシュから削除
  setTimeout(() => {
    recentlyCreatedBoards.delete(key);
  }, 5000);
};

/**
 * プロジェクト内のボード名の重複をチェック（最適化版）
 */
export const checkBoardNameDuplicate = async (
  projectId: string,
  boardName: string,
  excludeBoardId?: string
): Promise<boolean> => {
  const startTime = performance.now();
  
  // まず最近作成されたボードのキャッシュをチェック
  const cacheKey = `${projectId}:${boardName}`;
  const cached = recentlyCreatedBoards.get(cacheKey);
  if (cached) {
    console.log('[Duplicate Check] Found in recent cache:', performance.now() - startTime, 'ms');
    return cached.boardId !== excludeBoardId;
  }
  
  try {
    // インデックスを使って高速チェック
    const existingBoardId = await getBoardIdByTitle(projectId, boardName);
    console.log('[Duplicate Check] Index lookup took:', performance.now() - startTime, 'ms, found:', !!existingBoardId);
    
    if (!existingBoardId) {
      return false;
    }
    
    // 除外するボードIDと一致する場合は重複とみなさない
    if (excludeBoardId && existingBoardId === excludeBoardId) {
      return false;
    }
    
    return true;
  } catch (error) {
    console.error("Error checking board name duplicate:", error);
    // インデックスが利用できない場合のフォールバック
    return checkBoardNameDuplicateFallback(projectId, boardName, excludeBoardId);
  }
};

/**
 * プロジェクト内のボード名の重複をチェック（フォールバック版）
 */
const checkBoardNameDuplicateFallback = async (
  projectId: string,
  boardName: string,
  excludeBoardId?: string
): Promise<boolean> => {
  try {
    const projectBoardsRef = ref(rtdb, `projectBoards/${projectId}`);
    const snapshot = await get(projectBoardsRef);
    
    if (!snapshot.exists()) {
      return false;
    }

    const boards = snapshot.val();
    
    for (const [boardId, board] of Object.entries(boards)) {
      if (excludeBoardId && boardId === excludeBoardId) {
        continue;
      }
      
      const boardData = board as Board;
      if (boardData.name === boardName) {
        return true;
      }
    }
    
    return false;
  } catch (error) {
    console.error("Error checking board name duplicate (fallback):", error);
    return false;
  }
};

/**
 * 重複しない新しいボード名を生成
 */
export const generateUniqueBoardName = async (
  projectId: string,
  baseName: string = "Untitled",
  excludeBoardId?: string
): Promise<string> => {
  // まずベース名そのものをチェック
  const baseNameExists = await checkBoardNameDuplicate(
    projectId,
    baseName,
    excludeBoardId
  );
  
  if (!baseNameExists) {
    return baseName;
  }

  // 番号を付けて重複しない名前を探す
  let counter = 1;
  let candidateName = `${baseName}_${counter}`;
  
  while (await checkBoardNameDuplicate(projectId, candidateName, excludeBoardId)) {
    counter++;
    candidateName = `${baseName}_${counter}`;
  }
  
  return candidateName;
};

/**
 * 新しいボード用の一意な名前を生成
 */
export const generateNewBoardName = async (
  projectId: string
): Promise<string> => {
  return await generateUniqueBoardName(projectId, "Untitled");
};