import { rtdb } from "../config/firebase";
import { ref, get, update } from "firebase/database";
import { Note } from "../types";
import { getBoardThumbnail } from "./thumbnailGenerator";

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
      // Gyazo URLを探す
      const gyazoMatch = note.content.match(
        /https:\/\/gyazo\.com\/([a-zA-Z0-9]+)/
      );
      if (gyazoMatch) {
        const id = gyazoMatch[1];
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
  } catch (error) {
    console.error("Error updating board metadata:", error);
  }
}