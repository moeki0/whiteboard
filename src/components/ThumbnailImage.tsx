import React, { useState, useEffect } from "react";
import { getBoardInfo } from "../utils/boardInfo";
import { getBoardThumbnail } from "../utils/thumbnailGenerator";

interface ThumbnailImageProps {
  boardName: string;
  projectId: string;
  className?: string;
  alt?: string;
  style?: React.CSSProperties;
}

/**
 * [pageTitle.img]記法で他のボードのサムネイル画像を表示するコンポーネント
 */
export const ThumbnailImage: React.FC<ThumbnailImageProps> = ({
  boardName,
  projectId,
  className = "",
  alt,
  style,
}) => {
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchThumbnail = async () => {
      try {
        setLoading(true);
        setError(null);

        // Firebase から該当プロジェクトのボードを検索
        const { rtdb } = await import("../config/firebase");
        const { ref, get } = await import("firebase/database");

        const boardsRef = ref(rtdb, "boards");
        const boardsSnapshot = await get(boardsRef);
        const allBoards = boardsSnapshot.val() || {};

        // 同じプロジェクト内のボードを検索
        const projectBoards = Object.entries(allBoards)
          .filter(
            ([, board]: [string, unknown]) =>
              (board as Record<string, unknown>).projectId === projectId
          )
          .map(([id, board]: [string, unknown]) => ({
            ...(board as Record<string, unknown>),
            id,
          }));

        // ボード名が一致するボードを探す
        let targetBoard = null;
        for (const board of projectBoards) {
          const boardInfo = await getBoardInfo(board.id);
          const boardTitle = boardInfo.title || board.name || "";

          if (boardTitle.toLowerCase() === boardName.toLowerCase()) {
            targetBoard = board;
            break;
          }
        }

        if (!targetBoard) {
          throw new Error(`ボード "${boardName}" が見つかりません`);
        }

        // サムネイルを取得
        let thumbnail = null;

        // 手動保存されたサムネイルを最初にチェック
        thumbnail = await getBoardThumbnail(targetBoard.id);

        if (!thumbnail) {
          // 手動保存サムネイルがない場合は、ボード情報からサムネイルを取得
          const boardInfo = await getBoardInfo(targetBoard.id);
          thumbnail = boardInfo.thumbnailUrl;
        }

        if (!thumbnail) {
          throw new Error(`ボード "${boardName}" のサムネイルが見つかりません`);
        }

        setThumbnailUrl(thumbnail);
      } catch (err) {
        console.error("サムネイル取得エラー:", err);
        setError(
          err instanceof Error ? err.message : "サムネイル取得に失敗しました"
        );
      } finally {
        setLoading(false);
      }
    };

    fetchThumbnail();
  }, [boardName, projectId]);

  if (loading) {
    return (
      <div
        className={`inline-block bg-gray-200 animate-pulse rounded ${className}`}
        style={{ width: "200px", height: "150px", ...style }}
      >
        <div className="flex items-center justify-center h-full text-gray-500 text-sm">
          読み込み中...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div
        className={`inline-block bg-red-50 border border-red-200 rounded p-2 ${className}`}
        style={{ width: "200px", height: "150px", ...style }}
      >
        <div className="flex items-center justify-center h-full text-red-500 text-sm text-center">
          {error}
        </div>
      </div>
    );
  }

  if (!thumbnailUrl) {
    return (
      <div
        className={`inline-block bg-gray-100 border border-gray-200 rounded p-2 ${className}`}
        style={{ width: "200px", height: "150px", ...style }}
      >
        <div className="flex items-center justify-center h-full text-gray-500 text-sm">
          サムネイルなし
        </div>
      </div>
    );
  }

  return (
    <img
      src={thumbnailUrl}
      alt={alt || `${boardName}のサムネイル`}
      className={`inline-block rounded shadow-sm ${className}`}
      style={{
        maxWidth: "200px",
        maxHeight: "150px",
        ...style,
        pointerEvents: "none",
      }}
      onError={() => setError("画像の読み込みに失敗しました")}
    />
  );
};
