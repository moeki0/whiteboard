import { rtdb } from "../config/firebase";
import { ref, get, update } from "firebase/database";
import { Note } from "../types";
import { getBoardThumbnail } from "./thumbnailGenerator";
import { syncBoardToAlgoliaAsync } from "./algoliaSync";
import { updateBoardTitleIndex } from "./boardTitleIndex";

export interface BoardMetadata {
  title: string;
  description: string;
  thumbnailUrl: string | null;
  lastUpdated: number;
}

/**
 * ノートからボード情報を計算する（軽量版）
 */
export async function calculateBoardMetadata(
  boardId: string,
  notes: Note[]
): Promise<BoardMetadata> {
  // ボードの基本情報を取得
  const boardRef = ref(rtdb, `boards/${boardId}`);
  const boardSnapshot = await get(boardRef);
  const boardData = boardSnapshot.val();

  // タイトルはboard.nameから取得
  const title = boardData?.name || "";

  // 手動保存されたサムネイルを最初にチェック
  let thumbnailUrl: string | null = await getBoardThumbnail(boardId);

  // 手動サムネイルがない場合、ノートから画像URLを探す
  if (!thumbnailUrl) {
    const sortedNotes = notes
      .filter((note) => note && note.content)
      .sort((a, b) => a.x - b.x || a.y - b.y);

    for (const note of sortedNotes) {
      // Gyazo URLを探す（角括弧ラップと通常のURLの両方に対応）
      const gyazoMatch = note.content.match(
        /(?:\[([^\]]*https:\/\/gyazo\.com\/[^\]]+)\]|https:\/\/gyazo\.com\/([a-zA-Z0-9]+))/
      );
      if (gyazoMatch) {
        let id: string;
        if (gyazoMatch[1]) {
          // 角括弧でラップされたURL
          const idMatch = gyazoMatch[1].match(
            /https:\/\/gyazo\.com\/([a-zA-Z0-9]+)/
          );
          if (idMatch) {
            id = idMatch[1];
          } else {
            continue; // IDが抽出できない場合は次のノートへ
          }
        } else if (gyazoMatch[2]) {
          // 通常のURL
          id = gyazoMatch[2];
        } else {
          continue; // マッチしなかった場合は次のノートへ
        }
        thumbnailUrl = `https://gyazo.com/${id}/max_size/300`;
        break;
      }

      // その他の画像URLを探す
      const imageMatch = note.content.match(
        /(https?:\/\/[^\s]+\.(jpg|jpeg|png|gif|webp))/i
      );
      if (imageMatch) {
        thumbnailUrl = imageMatch[1];
        break;
      }
    }
  }

  // 概要を全ての付箋から取得
  let description = "";
  if (notes.length > 0) {
    const allText = notes
      .filter((note) => note && note.content)
      .map((note) => note.content.trim())
      .filter((text) => text.length > 0)
      .join(" ");

    if (allText.length > 0) {
      description = allText.substring(0, 100);
      if (allText.length > 100) {
        description += "...";
      }
    }
  }

  return {
    title,
    description,
    thumbnailUrl,
    lastUpdated: Date.now(),
  };
}

/**
 * ボードのメタデータを更新する
 */
export async function updateBoardMetadata(
  boardId: string,
  notes: Note[]
): Promise<void> {
  try {
    const metadata = await calculateBoardMetadata(boardId, notes);

    const boardRef = ref(rtdb, `boards/${boardId}`);
    await update(boardRef, {
      updatedAt: Date.now(),
      metadata,
    });

    // Sync to Algolia asynchronously (non-blocking)
    get(boardRef)
      .then((updatedBoardSnapshot) => {
        if (updatedBoardSnapshot.exists()) {
          const updatedBoard = updatedBoardSnapshot.val();
          syncBoardToAlgoliaAsync(boardId, updatedBoard);
        }
      })
      .catch((error) => {
        console.error("Error getting board for Algolia sync:", error);
      });
  } catch (error) {
    console.error("Error updating board metadata:", error);
  }
}

/**
 * ボード名変更時にタイトルのみを更新する（軽量版）
 */
export async function updateBoardTitle(
  boardId: string,
  newTitle: string
): Promise<void> {
  try {
    // 既存のボード情報を取得（プロジェクトIDと古いタイトル取得のため）
    const boardRootRef = ref(rtdb, `boards/${boardId}`);
    const boardSnapshot = await get(boardRootRef);
    const boardData = boardSnapshot.val();

    if (boardData) {
      const oldTitle = boardData.name || "";
      const projectId = boardData.projectId;

      // ボードのnameフィールドを更新
      await update(boardRootRef, {
        name: newTitle,
        updatedAt: Date.now(),
      });

      // メタデータのタイトルも更新
      const boardRef = ref(rtdb, `boards/${boardId}/metadata`);
      await update(boardRef, {
        title: newTitle,
        lastUpdated: Date.now(),
      });

      // projectBoardsも同期更新（ボードリスト用）
      if (projectId) {
        const projectBoardRef = ref(rtdb, `projectBoards/${projectId}/${boardId}`);
        await update(projectBoardRef, {
          name: newTitle,
          updatedAt: Date.now(),
          metadata: {
            title: newTitle,
            lastUpdated: Date.now(),
          },
        });
        
        // タイトルインデックスを更新
        await updateBoardTitleIndex(projectId, boardId, oldTitle, newTitle);
      }

      // Sync to Algolia asynchronously (non-blocking)
      get(boardRootRef)
        .then((updatedBoardSnapshot) => {
          if (updatedBoardSnapshot.exists()) {
            const updatedBoard = updatedBoardSnapshot.val();
            syncBoardToAlgoliaAsync(boardId, updatedBoard);
          }
        })
        .catch((error) => {
          console.error("Error getting board for Algolia sync:", error);
        });
    }
  } catch (error) {
    console.error("Error updating board title:", error);
  }
}
