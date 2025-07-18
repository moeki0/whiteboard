import { rtdb } from "../config/firebase";
import { ref, get } from "firebase/database";
import { Note } from "../types";
import { getBoardThumbnail } from "./thumbnailGenerator";

export interface BoardInfo {
  title: string | null;
  thumbnailUrl: string | null;
  description: string | null;
}

/**
 * ボードの情報（タイトル、サムネイル、概要）を取得
 * - タイトル: board.nameから取得
 * - サムネイル: 付箋内の画像URL
 * - 概要: 付箋のテキストの先頭100文字
 */
// キャッシュを追加して無限再帰を防ぐ
const boardInfoCache = new Map<string, Promise<BoardInfo>>();

export async function getBoardInfo(
  boardId: string,
  _visitedBoards = new Set<string>()
): Promise<BoardInfo> {
  // 無限再帰を防ぐ
  if (_visitedBoards.has(boardId)) {
    return { title: null, thumbnailUrl: null, description: null };
  }
  _visitedBoards.add(boardId);

  // キャッシュをクリア（常に最新データを取得）
  boardInfoCache.delete(boardId);

  // Promiseを作成してキャッシュに保存
  const promise = (async () => {
    // ボードの基本情報を取得
    const boardRef = ref(rtdb, `boards/${boardId}`);
    const boardSnapshot = await get(boardRef);
    const boardData = boardSnapshot.val();

    // ボードのノートを直接取得
    const notesRef = ref(rtdb, `boards/${boardId}/notes`);
    const notesSnapshot = await get(notesRef);
    const notesData = notesSnapshot.val() || {};

    // ノートを配列に変換
    const allBoardNotes: Note[] = Object.entries(notesData).map(([id, note]) => ({
      ...(note as Note),
      id,
    }));

    const boardNotes = allBoardNotes
      .filter((note: Note) => note && note.content) // contentがあるノートのみ
      .sort((a: Note, b: Note) => a.x - b.x || a.y - b.y); // 左上から順にソート

    // タイトルはboard.nameから取得
    let title: string | null = boardData?.name || null;
    let thumbnailUrl: string | null = null;
    let description: string | null = null;

    // 手動保存されたサムネイルを最初にチェック
    const savedThumbnail = await getBoardThumbnail(boardId);
    if (savedThumbnail) {
      thumbnailUrl = savedThumbnail;
    }

    // 全ての付箋からサムネイルを探す
    for (const note of boardNotes) {
      // サムネイルがまだ見つかっていない場合、サムネイルを探す
      if (!thumbnailUrl) {
        // [pageTitle.img]記法を探す（ボードサムネイル用）
        const imgMatch = note.content.match(/\[([^\]]+)\.img\]/);
        if (imgMatch) {
          const pageName = imgMatch[1];

          // プロジェクト内の全ボードを取得
          const boardsRef = ref(rtdb, `boards`);
          const boardsSnapshot = await get(boardsRef);
          const allBoards = boardsSnapshot.val() || {};

          if (boardData?.projectId) {
            // 同じプロジェクト内のボードを検索
            const projectBoards = Object.entries(allBoards)
              .filter(
                ([, board]: [string, unknown]) => {
                  const boardObj = board as { projectId?: string };
                  return boardObj.projectId === boardData.projectId;
                }
              )
              .map(([id, board]: [string, unknown]) => ({ ...(board as object), id }));

            // ボード名またはパースしたタイトルがpageNameと一致するボードを探す
            for (const targetBoard of projectBoards) {
              if (targetBoard.id === boardId) continue; // 自分自身はスキップ

              const targetBoardInfo = await getBoardInfo(
                targetBoard.id,
                _visitedBoards
              );
              const boardTitle =
                targetBoardInfo.title || (targetBoard as any).name || "";

              if (boardTitle.toLowerCase() === pageName.toLowerCase()) {
                // 対象ボードの手動保存サムネイルを取得
                const targetSavedThumbnail = await getBoardThumbnail(targetBoard.id);
                if (targetSavedThumbnail) {
                  thumbnailUrl = targetSavedThumbnail;
                  break;
                }
                // 手動保存サムネイルがない場合は、対象ボードのサムネイルを使用
                if (targetBoardInfo.thumbnailUrl) {
                  thumbnailUrl = targetBoardInfo.thumbnailUrl;
                  break;
                }
              }
            }
          }
        } else {
          // [name.icon]記法を探す（ボードサムネイル用）
          const iconMatch = note.content.match(/\[([^\]]+)\.icon\]/);
          if (iconMatch) {
            const iconName = iconMatch[1];

            // プロジェクト内の全ボードを取得
            const boardsRef = ref(rtdb, `boards`);
            const boardsSnapshot = await get(boardsRef);
            const allBoards = boardsSnapshot.val() || {};

            if (boardData?.projectId) {
              // 同じプロジェクト内のボードを検索
              const projectBoards = Object.entries(allBoards)
                .filter(
                  ([, board]: [string, unknown]) => {
                    const boardObj = board as { projectId?: string };
                    return boardObj.projectId === boardData.projectId;
                  }
                )
                .map(([id, board]: [string, unknown]) => ({ ...(board as object), id }));

              // ボード名またはパースしたタイトルがiconNameと一致するボードを探す
              for (const targetBoard of projectBoards) {
                if (targetBoard.id === boardId) continue; // 自分自身はスキップ

                const targetBoardInfo = await getBoardInfo(
                  targetBoard.id,
                  _visitedBoards
                );
                const boardTitle =
                  targetBoardInfo.title || (targetBoard as any).name || "";

                if (boardTitle.toLowerCase() === iconName.toLowerCase()) {
                  if (targetBoardInfo.thumbnailUrl) {
                    thumbnailUrl = targetBoardInfo.thumbnailUrl;
                    break;
                  }
                }
              }
            }
          } else {
            // Gyazo URLを探す
            const gyazoMatch = note.content.match(
              /https:\/\/gyazo\.com\/([a-zA-Z0-9]+)/
            );
            if (gyazoMatch) {
              const id = gyazoMatch[1];
              thumbnailUrl = `https://gyazo.com/${id}/max_size/300`;
            } else {
              // その他の画像URLを探す
              const imageMatch = note.content.match(
                /(https?:\/\/[^\s]+\.(jpg|jpeg|png|gif|webp))/i
              );
              if (imageMatch) {
                thumbnailUrl = imageMatch[1];
              }
            }
          }
        }
      }

      // サムネイルが見つかったら終了
      if (thumbnailUrl) {
        break;
      }
    }

    // 概要を全ての付箋から取得
    if (boardNotes.length > 0) {
      // 全ての付箋のテキストを結合
      const allText = boardNotes
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
      thumbnailUrl,
      description,
    };
  })();

  // キャッシュに保存
  boardInfoCache.set(boardId, promise);

  try {
    return await promise;
  } catch (error) {
    console.error("Error getting board info:", error);
    // エラーの場合はキャッシュから削除
    boardInfoCache.delete(boardId);
    return {
      title: null,
      thumbnailUrl: null,
      description: null,
    };
  }
}
