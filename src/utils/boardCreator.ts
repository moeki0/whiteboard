import { nanoid } from "nanoid";
import { rtdb } from "../config/firebase";
import { ref, update, get } from "firebase/database";
import { Board, Project } from "../types";
import { checkBoardNameDuplicate, addToRecentlyCreated } from "./boardNaming";
import { normalizeTitle } from "./boardTitleIndex";
import { updateBoardListItem } from "./boardDataStructure";
import { isProjectMember } from "./permissions";

/**
 * タイトルから新しいボードを作成する
 */
export const createBoardFromTitle = async (
  projectId: string,
  boardTitle: string,
  userId: string
): Promise<string> => {
  try {
    // プロジェクトのメンバーシップをチェック
    const projectRef = ref(rtdb, `projects/${projectId}`);
    const projectSnapshot = await get(projectRef);
    
    if (!projectSnapshot.exists()) {
      throw new Error('Project not found');
    }
    
    const project: Project = projectSnapshot.val();
    if (!isProjectMember(project, userId)) {
      throw new Error('User is not a member of this project');
    }

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
    const boardData: Omit<Board, "id"> = {
      name: finalBoardName,
      createdBy: userId,
      createdAt: now,
      updatedAt: now,
      projectId: projectId,
    };

    // バッチ更新用のデータを準備
    const updates: { [key: string]: Board | string } = {};

    // ボードデータ
    updates[`boards/${boardId}`] = boardData;

    // プロジェクトボードの関連付け
    updates[`projectBoards/${projectId}/${boardId}`] = {
      ...boardData,
      id: boardId,
    };

    // タイトルインデックス
    const normalizedTitle = normalizeTitle(finalBoardName);
    if (normalizedTitle) {
      updates[`boardTitleIndex/${projectId}/${normalizedTitle}`] = boardId;
    }

    // 一括更新（アトミックな操作）
    await update(ref(rtdb), updates);

    // 新しいデータ構造にも追加
    try {
      await updateBoardListItem(projectId, boardId, { ...boardData, id: boardId });
    } catch (error) {
      console.warn('Failed to update new board structure:', error);
    }

    // 作成したボードをキャッシュに追加（インデックスの遅延対策）
    addToRecentlyCreated(projectId, finalBoardName, boardId);
    return boardId;
  } catch (error) {
    console.error("Error creating board from title:", error);
    throw error;
  }
};
