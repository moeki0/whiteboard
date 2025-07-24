import { LuMousePointer2, LuUser } from "react-icons/lu";
import { Cursor } from "../types";
import { useState, useEffect, memo } from "react";
import { getBoardIdByTitle } from "../utils/boardTitleIndex";
import { getBoardThumbnail } from "../utils/thumbnailGenerator";
import { getBoardInfo } from "../utils/boardInfo";

interface CursorDisplayProps {
  cursors: Record<string, Cursor>;
  projectId?: string;
}

// Component to render individual cursor with user board thumbnail
const UserCursor = memo(
  ({ cursor, projectId }: { cursor: Cursor; projectId?: string }) => {
    const userName =
      cursor.username || cursor.fullName?.split(" (")[0] || "User";
    const [userThumbnail, setUserThumbnail] = useState<string | null>(null);
    const [thumbnailLoading, setThumbnailLoading] = useState(true);

    useEffect(() => {
      const fetchUserThumbnail = async () => {
        if (!projectId || !userName) {
          setThumbnailLoading(false);
          return;
        }

        try {
          // ボード名からIDを取得
          const targetBoardId = await getBoardIdByTitle(projectId, userName);

          if (!targetBoardId) {
            setThumbnailLoading(false);
            return;
          }

          // 手動保存サムネイルを優先取得
          let thumbnail = await getBoardThumbnail(targetBoardId);

          if (!thumbnail) {
            // 手動保存サムネイルがない場合はボード情報から取得
            const boardInfo = await getBoardInfo(targetBoardId);
            thumbnail = boardInfo.thumbnailUrl;
          }

          if (thumbnail) {
            setUserThumbnail(thumbnail);
          }
        } catch (error) {
          console.error(`Error fetching thumbnail for ${userName}:`, error);
        }

        setThumbnailLoading(false);
      };

      fetchUserThumbnail();
    }, [userName, projectId]);

    return (
      <div
        className="cursor"
        style={{
          left: `${cursor.x}px`,
          top: `${cursor.y}px`,
          '--cursor-color': cursor.color || "#ff4444",
        } as React.CSSProperties}
      >
        <div className="cursor-pointer">
          <LuMousePointer2
            style={{
              color: 'var(--cursor-color)',
              fill: 'var(--cursor-color)',
            }}
          />
        </div>
        <div
          className="cursor-label"
          style={{
            borderColor: 'var(--cursor-color)',
          }}
          title={cursor.fullName}
        >
          {!thumbnailLoading && userThumbnail ? (
            <img
              src={userThumbnail}
              alt={`${userName} board thumbnail`}
              className="cursor-thumbnail"
              draggable={false}
              onDragStart={(e) => e.preventDefault()}
            />
          ) : (
            <LuUser className="cursor-user-icon" />
          )}
        </div>
      </div>
    );
  }
);

export function CursorDisplay({ cursors, projectId }: CursorDisplayProps) {
  return (
    <>
      {Object.entries(cursors).map(([cursorId, cursor]) => (
        <UserCursor key={cursorId} cursor={cursor} projectId={projectId} />
      ))}
    </>
  );
}
