import { rtdb } from "../config/firebase";
import { ref as dbRef, set, get } from "firebase/database";

/**
 * ボードサムネイルURLをFirebase Databaseに保存
 */
export async function saveBoardThumbnail(
  boardId: string,
  thumbnailUrl: string
): Promise<boolean> {
  try {
    const boardThumbnailRef = dbRef(rtdb, `boardThumbnails/${boardId}`);
    await set(boardThumbnailRef, {
      url: thumbnailUrl,
      updatedAt: Date.now(),
    });

    return true;
  } catch (error) {
    console.error("❌ Error saving board thumbnail:", error);
    return false;
  }
}

/**
 * ボードサムネイルURLを取得
 */
export async function getBoardThumbnail(
  boardId: string
): Promise<string | null> {
  try {
    const boardThumbnailRef = dbRef(rtdb, `boardThumbnails/${boardId}`);
    const snapshot = await get(boardThumbnailRef);

    if (snapshot.exists()) {
      const data = snapshot.val();
      return data.url;
    }

    return null;
  } catch (error) {
    console.error("❌ Error getting thumbnail:", error);
    return null;
  }
}

/**
 * ボードサムネイルを削除
 */
export async function deleteBoardThumbnail(boardId: string): Promise<void> {
  try {
    // Database からURLを削除
    const boardThumbnailRef = dbRef(rtdb, `boardThumbnails/${boardId}`);
    await set(boardThumbnailRef, null);
  } catch (error) {
    // Silent fail - 画像が存在しない場合もあるため
  }
}
