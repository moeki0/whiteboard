import { rtdb } from "../config/firebase";
import { ref, get, set } from "firebase/database";

export interface ThumbnailInfo {
  boardId: string;
  url: string;
  title: string;
  createdAt: number;
  updatedAt: number;
}

/**
 * HTML2Canvas を使用してボードのサムネイルを生成
 */
export async function generateBoardThumbnail(
  boardId: string,
  boardElement: HTMLElement,
  title: string
): Promise<string> {
  try {
    // 動的に html2canvas をインポート
    const html2canvas = await import("html2canvas");
    
    // ボードの可視領域を取得
    const canvas = await html2canvas.default(boardElement, {
      allowTaint: true,
      useCORS: true,
      width: 800,
      height: 600,
    });

    // Canvas を Data URL に変換
    const dataUrl = canvas.toDataURL("image/png", 0.8);

    // Firebase に保存
    const thumbnailRef = ref(rtdb, `boardThumbnails/${boardId}`);
    const thumbnailInfo: ThumbnailInfo = {
      boardId,
      url: dataUrl,
      title,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    await set(thumbnailRef, thumbnailInfo);

    return dataUrl;
  } catch (error) {
    console.error("サムネイル生成エラー:", error);
    throw new Error("サムネイル生成に失敗しました");
  }
}

/**
 * 保存されたサムネイルを取得
 */
export async function getBoardThumbnail(boardId: string): Promise<string | null> {
  try {
    const thumbnailRef = ref(rtdb, `boardThumbnails/${boardId}`);
    const snapshot = await get(thumbnailRef);
    const thumbnailInfo = snapshot.val() as ThumbnailInfo | null;
    
    return thumbnailInfo?.url || null;
  } catch (error) {
    console.error("サムネイル取得エラー:", error);
    return null;
  }
}

/**
 * ボードのサムネイルを削除
 */
export async function deleteBoardThumbnail(boardId: string): Promise<void> {
  try {
    const thumbnailRef = ref(rtdb, `boardThumbnails/${boardId}`);
    await set(thumbnailRef, null);
  } catch (error) {
    console.error("サムネイル削除エラー:", error);
    throw new Error("サムネイル削除に失敗しました");
  }
}

/**
 * サムネイルの更新日時を更新
 */
export async function updateThumbnailTimestamp(boardId: string): Promise<void> {
  try {
    const thumbnailRef = ref(rtdb, `boardThumbnails/${boardId}`);
    const snapshot = await get(thumbnailRef);
    const thumbnailInfo = snapshot.val() as ThumbnailInfo | null;
    
    if (thumbnailInfo) {
      thumbnailInfo.updatedAt = Date.now();
      await set(thumbnailRef, thumbnailInfo);
    }
  } catch (error) {
    console.error("サムネイル更新日時の更新エラー:", error);
  }
}