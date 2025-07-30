import { ref, get } from "firebase/database";
import { rtdb } from "../config/firebase";
import { Board, Note, Arrow, Group, Project } from "../types";
import { calculateNoteDimensions } from "./noteUtils";

// エクスポート用のNote型（widthとheightが数値）
export interface ExportedNote extends Omit<Note, 'width'> {
  width: number;
  height: number;
}

export interface ExportedBoardData {
  board: Board;
  notes: ExportedNote[];
  arrows: Arrow[];
  groups: Group[];
  exportedAt: string;
  version: string;
  env: string;
}

export interface ExportedProjectData {
  boards: ExportedBoardData[];
  exportedAt: string;
  version: string;
  env: string;
}

/**
 * 単一ボードのデータをエクスポート
 */
export async function exportBoardData(
  boardId: string
): Promise<ExportedBoardData> {
  try {
    console.log(`🔄 Starting export for board: ${boardId}`);

    // ボード情報を取得
    const boardRef = ref(rtdb, `boards/${boardId}`);
    const boardSnapshot = await get(boardRef);

    if (!boardSnapshot.exists()) {
      console.error(`❌ Board with ID ${boardId} not found`);
      throw new Error(`Board with ID ${boardId} not found`);
    }

    const board = { id: boardId, ...boardSnapshot.val() } as Board;
    console.log(`✅ Board data loaded:`, { name: board.name, id: board.id });

    // 付箋データを取得
    const notesRef = ref(rtdb, `boards/${boardId}/notes`);
    const notesSnapshot = await get(notesRef);
    const notes: ExportedNote[] = [];

    if (notesSnapshot.exists()) {
      const notesData = notesSnapshot.val();
      Object.entries(notesData).forEach(([id, note]) => {
        const noteData = note as Omit<Note, "id" | "type">;
        
        // 付箋のサイズを計算
        const dimensions = calculateNoteDimensions(noteData as Note);
        
        // widthを数値に正規化（"200px" -> 200）
        const widthValue = noteData.width ? parseInt(noteData.width.replace('px', '')) || 160 : 160;
        
        notes.push({
          id,
          type: "note" as const,
          ...noteData,
          // 座標をずらす
          x: noteData.x - 800,
          y: noteData.y - 400,
          // サイズを数値で正規化
          width: widthValue,
          height: dimensions.height,
        } as ExportedNote);
      });
      console.log(
        `📝 Loaded ${notes.length} notes (coordinates shifted, dimensions normalized)`
      );
    } else {
      console.log(`📝 No notes found for board ${boardId}`);
    }

    // 矢印データを取得
    const arrowsRef = ref(rtdb, `boards/${boardId}/arrows`);
    const arrowsSnapshot = await get(arrowsRef);
    const arrows: Arrow[] = [];

    if (arrowsSnapshot.exists()) {
      const arrowsData = arrowsSnapshot.val();
      Object.entries(arrowsData).forEach(([id, arrow]) => {
        arrows.push({
          id,
          type: "arrow" as const,
          ...(arrow as Omit<Arrow, "id" | "type">),
        });
      });
      console.log(`🏹 Loaded ${arrows.length} arrows`);
    } else {
      console.log(`🏹 No arrows found for board ${boardId}`);
    }

    // グループデータを取得
    const groupsRef = ref(rtdb, `boards/${boardId}/groups`);
    const groupsSnapshot = await get(groupsRef);
    const groups: Group[] = [];

    if (groupsSnapshot.exists()) {
      const groupsData = groupsSnapshot.val();
      Object.entries(groupsData).forEach(([id, group]) => {
        groups.push({
          id,
          type: "group" as const,
          ...(group as Omit<Group, "id" | "type">),
        });
      });
      console.log(`👥 Loaded ${groups.length} groups`);
    } else {
      console.log(`👥 No groups found for board ${boardId}`);
    }

    const exportData = {
      board,
      notes,
      arrows,
      groups,
      exportedAt: new Date().toISOString(),
      version: "1.0.0",
      env: "turtle",
    };

    console.log(`🎉 Board export completed:`, {
      boardName: board.name,
      notesCount: notes.length,
      arrowsCount: arrows.length,
      groupsCount: groups.length,
      exportSize: JSON.stringify(exportData).length,
    });

    return exportData;
  } catch (error) {
    console.error("Error exporting board data:", error);
    throw error;
  }
}

/**
 * プロジェクト全体のデータをエクスポート
 */
export async function exportProjectData(
  projectId: string
): Promise<ExportedProjectData> {
  try {
    console.log(`🚀 Starting project boards export for: ${projectId}`);

    // プロジェクト内のボード一覧を取得
    const projectBoardsRef = ref(rtdb, `projectBoards/${projectId}`);
    const projectBoardsSnapshot = await get(projectBoardsRef);

    const boards: ExportedBoardData[] = [];

    if (projectBoardsSnapshot.exists()) {
      const boardIds = Object.keys(projectBoardsSnapshot.val());
      console.log(`📋 Found ${boardIds.length} boards in project`);

      // 各ボードのデータをエクスポート
      for (const boardId of boardIds) {
        try {
          console.log(`⏳ Exporting board ${boardId}...`);
          const boardData = await exportBoardData(boardId);
          boards.push(boardData);
        } catch (error) {
          console.warn(`⚠️ Failed to export board ${boardId}:`, error);
          // 個別ボードのエラーは警告として記録し、処理を続行
        }
      }
    } else {
      console.log(`📋 No boards found in project ${projectId}`);
    }

    const exportData = {
      boards,
      exportedAt: new Date().toISOString(),
      version: "1.0.0",
      env: "turtle",
    };

    console.log(`🎊 Project boards export completed:`, {
      boardsCount: boards.length,
      totalNotes: boards.reduce((sum, board) => sum + board.notes.length, 0),
      totalArrows: boards.reduce((sum, board) => sum + board.arrows.length, 0),
      totalGroups: boards.reduce((sum, board) => sum + board.groups.length, 0),
      exportSize: JSON.stringify(exportData).length,
    });

    return exportData;
  } catch (error) {
    console.error("Error exporting project data:", error);
    throw error;
  }
}

/**
 * データをJSONファイルとしてダウンロード
 */
export function downloadAsJSON(
  data: ExportedBoardData | ExportedProjectData,
  filename: string
): void {
  console.log(`💾 Starting download:`, {
    filename,
    dataSize: JSON.stringify(data).length,
  });

  const jsonString = JSON.stringify(data, null, 2);
  const blob = new Blob([jsonString], { type: "application/json" });

  console.log(`📦 Created blob:`, { size: blob.size, type: blob.type });

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);

  console.log(`✅ Download triggered for: ${filename}`);
}
