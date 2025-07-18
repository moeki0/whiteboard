import { rtdb } from "../config/firebase";
import { ref, get, set } from "firebase/database";
import { calculateBoardMetadata } from "../utils/boardMetadata";
import { Note } from "../types";

/**
 * 既存のボードに対してメタデータを生成する移行スクリプト
 */
export async function migrateBoardMetadata(projectId?: string): Promise<void> {
  try {
    // 全ボードまたは特定プロジェクトのボードを取得
    const boardsRef = ref(rtdb, "boards");
    const boardsSnapshot = await get(boardsRef);
    const allBoards = boardsSnapshot.val() || {};

    const boardEntries = Object.entries(allBoards).filter(
      ([, board]: [string, any]) => {
        return projectId ? board.projectId === projectId : true;
      }
    );

    let processedCount = 0;
    let successCount = 0;

    for (const [boardId] of boardEntries) {
      try {
        // ボードのノートを取得
        const notesRef = ref(rtdb, `boards/${boardId}/notes`);
        const notesSnapshot = await get(notesRef);
        const notesData = notesSnapshot.val() || {};

        // ノートを配列に変換
        const notes: Note[] = Object.entries(notesData).map(([id, note]) => ({
          ...(note as Note),
          id,
        }));

        // メタデータを計算
        const metadata = await calculateBoardMetadata(boardId, notes);

        // ボードにメタデータを保存
        const boardRef = ref(rtdb, `boards/${boardId}/metadata`);
        await set(boardRef, metadata);
      } catch (error) {
        console.error(`✗ Failed to process board ${boardId}:`, error);
      }
    }
  } catch (error) {
    console.error("Migration failed:", error);
    throw error;
  }
}

// 特定プロジェクトの移行を実行する関数
export async function migrateProjectBoardMetadata(
  projectId: string
): Promise<void> {
  return migrateBoardMetadata(projectId);
}

// 全ボードの移行を実行する関数
export async function migrateAllBoardMetadata(): Promise<void> {
  return migrateBoardMetadata();
}
