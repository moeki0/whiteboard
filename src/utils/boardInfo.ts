import { rtdb } from "../config/firebase";
import { ref, get } from "firebase/database";
import { Note } from "../types";

export interface BoardInfo {
  title: string | null;
  thumbnailUrl: string | null;
  description: string | null;
}

/**
 * ボードの情報（タイトル、サムネイル、概要）を取得
 * - タイトル: #で始まる付箋のテキスト（#を除く）
 * - サムネイル: #で始まる付箋内の画像URL
 * - 概要: #以外の付箋のテキストの先頭100文字
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
    // ボードのノートを直接取得
    const notesRef = ref(rtdb, `boards/${boardId}/notes`);
    const notesSnapshot = await get(notesRef);
    const notesData = notesSnapshot.val() || {};

    // ノートを配列に変換
    const allBoardNotes: Note[] = Object.entries(notesData).map(([id, note]) => ({
      ...(note as any),
      id,
    })) as Note[];

    const boardNotes = allBoardNotes
      .filter((note: any) => note && note.content) // contentがあるノートのみ
      .sort((a: any, b: any) => a.x - b.x || a.y - b.y); // 左上から順にソート

    // #で始まる付箋をすべて取得（行頭に#があるもののみ）
    const hashNotes = boardNotes.filter((note) => {
      if (!note.content) return false;
      // 最初の行が#で始まるかチェック
      const firstLine = note.content.split("\n")[0].trim();
      return firstLine.match(/^#+/);
    });

    // #以外の付箋を探す
    const nonHashNotes = boardNotes.filter((note) => {
      if (!note.content) return false;
      // 最初の行が#で始まらないもの
      const firstLine = note.content.split("\n")[0].trim();
      return !firstLine.match(/^#+/);
    });

    let title: string | null = null;
    let thumbnailUrl: string | null = null;
    let description: string | null = null;

    // 複数の#付箋からタイトルとサムネイルを順次探す
    for (const hashNote of hashNotes) {
      // タイトルがまだ見つかっていない場合、タイトルを探す
      if (!title) {
        const firstLine = hashNote.content.split("\n")[0].trim();
        const titleMatch = firstLine.match(/^#+\s*(.+)$/);
        if (titleMatch) {
          const candidateTitle = titleMatch[1].trim();
          // URLでない場合のみタイトルとして使用
          if (!candidateTitle.match(/^https?:\/\//)) {
            title = candidateTitle;
          }
        }
      }

      // サムネイルがまだ見つかっていない場合、サムネイルを探す
      if (!thumbnailUrl) {
        // [name.icon]記法を探す（ボードサムネイル用）
        const iconMatch = hashNote.content.match(/\[([^\]]+)\.icon\]/);
        if (iconMatch) {
          const iconName = iconMatch[1];

          // プロジェクト内の全ボードを取得
          const boardsRef = ref(rtdb, `boards`);
          const boardsSnapshot = await get(boardsRef);
          const allBoards = boardsSnapshot.val() || {};

          // 現在のボードのプロジェクトIDを取得
          const currentBoardRef = ref(rtdb, `boards/${boardId}`);
          const currentBoardSnapshot = await get(currentBoardRef);
          const currentBoard = currentBoardSnapshot.val();

          if (currentBoard?.projectId) {
            // 同じプロジェクト内のボードを検索
            const projectBoards = Object.entries(allBoards)
              .filter(
                ([_, board]: [string, any]) =>
                  board.projectId === currentBoard.projectId
              )
              .map(([id, board]: [string, any]) => ({ ...board, id }));

            // ボード名またはパースしたタイトルがiconNameと一致するボードを探す
            for (const targetBoard of projectBoards) {
              if (targetBoard.id === boardId) continue; // 自分自身はスキップ

              const targetBoardInfo = await getBoardInfo(
                targetBoard.id,
                _visitedBoards
              );
              const boardTitle =
                targetBoardInfo.title || targetBoard.name || "";

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
          const gyazoMatch = hashNote.content.match(
            /https:\/\/gyazo\.com\/([a-zA-Z0-9]+)/
          );
          if (gyazoMatch) {
            const id = gyazoMatch[1];
            thumbnailUrl = `https://gyazo.com/${id}/max_size/300`;
          } else {
            // その他の画像URLを探す
            const imageMatch = hashNote.content.match(
              /(https?:\/\/[^\s]+\.(jpg|jpeg|png|gif|webp))/i
            );
            if (imageMatch) {
              thumbnailUrl = imageMatch[1];
            }
          }
        }
      }

      // タイトルとサムネイルの両方が見つかったら終了
      if (title && thumbnailUrl) {
        break;
      }
    }

    // 概要を#以外の付箋から取得
    if (nonHashNotes.length > 0) {
      // 全ての#以外の付箋のテキストを結合
      const allText = nonHashNotes
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
