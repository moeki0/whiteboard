import { rtdb } from "../config/firebase";
import { ref, get } from "firebase/database";
import { Board } from "../types";

/**
 * プロジェクト内のボード名の重複をチェック
 */
export const checkBoardNameDuplicate = async (
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
    console.error("Error checking board name duplicate:", error);
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