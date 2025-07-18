import { nanoid } from "nanoid";
import { rtdb } from "../config/firebase";
import { ref, set, update } from "firebase/database";
import { Board } from "../types";
import { checkBoardNameDuplicate, addToRecentlyCreated } from "./boardNaming";
import { normalizeTitle } from "./boardTitleIndex";

/**
 * タイトルから新しいボードを作成する
 */
export const createBoardFromTitle = async (
  projectId: string,
  boardTitle: string,
  userId: string
): Promise<string> => {
  const startTime = performance.now();

  try {
    // ボード名の重複チェック
    const dupCheckStart = performance.now();
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
    const updates: { [key: string]: any } = {};

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
    performance.now();
    await update(ref(rtdb), updates);

    // 作成したボードをキャッシュに追加（インデックスの遅延対策）
    addToRecentlyCreated(projectId, finalBoardName, boardId);
    return boardId;
  } catch (error) {
    console.error("Error creating board from title:", error);
    throw error;
  }
};
