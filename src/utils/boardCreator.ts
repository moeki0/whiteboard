import { nanoid } from 'nanoid';
import { rtdb } from '../config/firebase';
import { ref, set } from 'firebase/database';
import { Board } from '../types';
import { checkBoardNameDuplicate } from './boardNaming';

/**
 * タイトルから新しいボードを作成する
 */
export const createBoardFromTitle = async (
  projectId: string,
  boardTitle: string,
  userId: string
): Promise<string> => {
  try {
    // ボード名の重複チェック
    const isDuplicate = await checkBoardNameDuplicate(projectId, boardTitle);
    
    // 重複する場合は番号を付けて一意にする
    let finalBoardName = boardTitle;
    if (isDuplicate) {
      let counter = 1;
      let candidateName = `${boardTitle}_${counter}`;
      
      while (await checkBoardNameDuplicate(projectId, candidateName)) {
        counter++;
        candidateName = `${boardTitle}_${counter}`;
      }
      
      finalBoardName = candidateName;
    }

    // 新しいボードIDを生成
    const boardId = nanoid();
    const now = Date.now();

    // ボードデータを作成
    const boardData: Omit<Board, 'id'> = {
      name: finalBoardName,
      createdBy: userId,
      createdAt: now,
      updatedAt: now,
      projectId: projectId,
    };

    // Firebaseに保存
    const boardRef = ref(rtdb, `boards/${boardId}`);
    await set(boardRef, boardData);

    // プロジェクトボードの関連付け
    const projectBoardRef = ref(rtdb, `projectBoards/${projectId}/${boardId}`);
    await set(projectBoardRef, { ...boardData, id: boardId });

    return boardId;
  } catch (error) {
    console.error('Error creating board from title:', error);
    throw error;
  }
};