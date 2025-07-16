import html2canvas from "html2canvas";
import { storage, rtdb } from "../config/firebase";
import {
  ref as storageRef,
  uploadString,
  getDownloadURL,
  deleteObject,
} from "firebase/storage";
import { ref as dbRef, set, get } from "firebase/database";
import { calculateBorderColor } from "./borderColors";

export interface ThumbnailOptions {
  width?: number;
  height?: number;
  scale?: number;
  backgroundColor?: string;
}

/**
 * ボード全体のサムネイル画像を生成
 */
export async function generateBoardThumbnail(
  boardElement: HTMLElement,
  options: ThumbnailOptions = {}
): Promise<string | null> {
  try {
    if (!boardElement) {
      console.error("❌ Board element is null");
      return null;
    }

    const thumbnailWidth = options.width || 1000;
    const thumbnailHeight = options.height || 750;

    // ボードの左上1000pxをキャプチャ
    const canvas = await html2canvas(boardElement, {
      backgroundColor: options.backgroundColor || "#f5f5f5",
      scale: options.scale || 1,
      useCORS: true,
      allowTaint: true,
      logging: true,
      width: 1000,
      height: 1000,
      x: 0,
      y: 0,
      onclone: (clonedDoc: Document) => {
        // クローンされたDOM内で付箋のスタイルを変更
        const clonedNotes = clonedDoc.querySelectorAll(".sticky-note");
        clonedNotes.forEach((note) => {
          const htmlNote = note as HTMLElement;
          // アクティブ・選択状態のスタイルを削除
          htmlNote.classList.remove("active", "selected");
          // 背景色を取得してボーダー色を計算
          const backgroundColor = htmlNote.style.backgroundColor || '#ffffff';
          const borderColor = calculateBorderColor(backgroundColor);
          // 適切なボーダーを適用
          htmlNote.style.border = `1px solid ${borderColor}`;
          htmlNote.style.boxShadow = "0 0 10px rgba(0, 0, 0, 0.05)";
        });
      },
    } as any);

    // サムネイルサイズにリサイズ
    const thumbnailCanvas = document.createElement("canvas");
    thumbnailCanvas.width = thumbnailWidth;
    thumbnailCanvas.height = thumbnailHeight;

    const ctx = thumbnailCanvas.getContext("2d");
    if (!ctx) return null;

    // 背景色を設定
    ctx.fillStyle = options.backgroundColor || "#f5f5f5";
    ctx.fillRect(0, 0, thumbnailWidth, thumbnailHeight);

    // アスペクト比を保持してリサイズ
    const sourceAspect = canvas.width / canvas.height;
    const targetAspect = thumbnailWidth / thumbnailHeight;

    let drawWidth, drawHeight, drawX, drawY;

    if (sourceAspect > targetAspect) {
      // 幅に合わせる
      drawWidth = thumbnailWidth;
      drawHeight = thumbnailWidth / sourceAspect;
      drawX = 0;
      drawY = (thumbnailHeight - drawHeight) / 2;
    } else {
      // 高さに合わせる
      drawHeight = thumbnailHeight;
      drawWidth = thumbnailHeight * sourceAspect;
      drawX = (thumbnailWidth - drawWidth) / 2;
      drawY = 0;
    }

    ctx.drawImage(canvas, drawX, drawY, drawWidth, drawHeight);

    const dataUrl = thumbnailCanvas.toDataURL("image/png");

    return dataUrl;
  } catch (error) {
    return null;
  }
}

/**
 * ボードサムネイルをFirebase Storageに保存
 */
export async function saveBoardThumbnail(
  boardId: string,
  thumbnailDataUrl: string
): Promise<boolean> {
  try {
    const thumbnailRef = storageRef(storage, `thumbnails/${boardId}.png`);

    await deleteObject(thumbnailRef);

    // Data URLからbase64部分を抽出
    const base64Data = thumbnailDataUrl.split(",")[1];

    await uploadString(thumbnailRef, base64Data, "base64", {
      contentType: "image/png",
    });

    const downloadURL = await getDownloadURL(thumbnailRef);

    const boardThumbnailRef = dbRef(rtdb, `boardThumbnails/${boardId}`);
    await set(boardThumbnailRef, {
      url: downloadURL,
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
    // Storage から画像を削除
    const thumbnailRef = storageRef(storage, `thumbnails/${boardId}.png`);
    await deleteObject(thumbnailRef);

    // Database からURLを削除
    const boardThumbnailRef = dbRef(rtdb, `boardThumbnails/${boardId}`);
    await set(boardThumbnailRef, null);
  } catch (error) {
    // Silent fail - 画像が存在しない場合もあるため
  }
}
