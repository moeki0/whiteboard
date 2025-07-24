import { useState, useEffect, useCallback, useRef, memo } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useProject } from "../contexts/ProjectContext";
import { useSlug } from "../contexts/SlugContext";
import { User, Board, Cursor, Project } from "../types";
import { LuPlus } from "react-icons/lu";
import {
  generateNewBoardName,
  addToRecentlyCreated,
} from "../utils/boardNaming";
import { syncBoardToAlgoliaAsync } from "../utils/algoliaSync";
import { normalizeTitle } from "../utils/boardTitleIndex";
import { hasBoardUnreadContent } from "../utils/boardViewHistory";
import { LazyImage } from "./LazyImage";
import { isProjectMember } from "../utils/permissions";
import { useTrackProjectAccess } from "../hooks/useRecentProject";
import {
  getTruePaginatedBoards,
  ensureSortScoresForProject,
} from "../utils/truePagination";
import { ref, onValue, get, update } from "firebase/database";
import { rtdb } from "../config/firebase";
import { customAlphabet } from "nanoid";

interface BoardListProps {
  user: User | null;
  projectId?: string;
}

interface PaginationCursor {
  lastKey: string;
  lastValue: number;
  direction: "forward" | "backward";
}

export function BoardList({ user, projectId: propProjectId }: BoardListProps) {
  const { projectId: paramProjectId, projectSlug } = useParams();
  const { resolvedProjectId } = useSlug();
  const projectId = resolvedProjectId || propProjectId || paramProjectId;

  const navigate = useNavigate();
  const { updateCurrentProject } = useProject();

  // Track project access
  useTrackProjectAccess(projectId || null, projectSlug || null);

  // State
  const [boards, setBoards] = useState<Board[]>([]);
  const [boardCursors, setBoardCursors] = useState<
    Record<string, Record<string, Cursor>>
  >({});

  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cursor, setCursor] = useState<PaginationCursor | undefined>();
  const [initialLoading, setInitialLoading] = useState(true); // 初回ローディング状態
  const [isMember, setIsMember] = useState<boolean | null>(null); // メンバーシップ状態

  // Refs
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const itemsPerLoad = 20; // 一度に読み込む件数

  const nanoid = customAlphabet(
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789",
    21
  );

  // メンバーシップを早期チェック（関数定義を削除して直接実行）

  // 初期データを読み込み
  const loadInitialBoards = useCallback(async () => {
    if (!projectId) {
      return;
    }

    setLoading(true);
    setInitialLoading(true);
    setError(null);

    try {
      // プロジェクト情報とボードデータを並列で取得

      const [projectSnapshot, result] = await Promise.all([
        get(ref(rtdb, `projects/${projectId}`)),
        // sortScoreを自動設定してからボードデータを取得
        (async () => {
          await ensureSortScoresForProject(projectId);
          return getTruePaginatedBoards(projectId, itemsPerLoad);
        })(),
      ]);

      // プロジェクト情報を設定
      if (projectSnapshot.exists()) {
        const projectData = projectSnapshot.val();
        setProject(projectData);
        // updateCurrentProjectは依存関係から外して直接呼び出し
        try {
          updateCurrentProject(projectId, projectData.name);
        } catch (err) {
          console.warn("Failed to update current project:", err);
        }
        // メンバーシップを即座にチェック
        if (user) {
          setIsMember(isProjectMember(projectData, user.uid));
        }
      } else {
        try {
          updateCurrentProject(projectId);
        } catch (err) {
          console.warn("Failed to update current project:", err);
        }
        setIsMember(false);
      }

      if (result.items.length > 0) {
        setBoards(result.items as Board[]);
        setHasMore(result.hasNext);
        setCursor(result.nextCursor);
      } else {
        setBoards([]);
        setHasMore(false);
      }
    } catch (err) {
      console.error("Failed to load boards:", err);
      setError("Failed to load boards");
    } finally {
      setLoading(false);
      setInitialLoading(false);
    }
  }, [projectId]); // updateCurrentProjectを依存関係から削除

  // 追加データ読み込み（カーソルベースページネーション）
  const loadMoreData = useCallback(async () => {
    if (loading || !hasMore || !cursor || !projectId) return;

    setLoading(true);

    try {
      const result = await getTruePaginatedBoards(
        projectId,
        itemsPerLoad,
        cursor
      );

      if (result.items.length > 0) {
        setBoards((prev) => [...prev, ...(result.items as Board[])]);
        setHasMore(result.hasNext);
        setCursor(result.nextCursor);
      } else {
        setHasMore(false);
      }
    } catch (err) {
      console.error("Failed to load more boards:", err);
      setError("Failed to load more boards");
    } finally {
      setLoading(false);
    }
  }, [loading, hasMore, cursor, projectId]);

  // Intersection Observer for infinite scroll
  useEffect(() => {
    if (!hasMore || loading) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          loadMoreData();
        }
      },
      {
        threshold: 0.1,
        rootMargin: "100px", // 100px before reaching the element
      }
    );

    if (loadMoreRef.current) {
      observer.observe(loadMoreRef.current);
    }

    return () => {
      if (loadMoreRef.current) {
        observer.unobserve(loadMoreRef.current);
      }
    };
  }, [hasMore, loading, loadMoreData]);

  // 早期メンバーシップチェック
  useEffect(() => {
    if (projectId && user) {
      const checkMembership = async () => {
        try {
          // メンバーシップ情報のみを先に取得（軽量）
          const memberRef = ref(
            rtdb,
            `projects/${projectId}/members/${user.uid}`
          );
          const memberSnapshot = await get(memberRef);
          setIsMember(memberSnapshot.exists());
        } catch (err) {
          console.warn("Failed to check membership early:", err);
        }
      };
      checkMembership();
    }
  }, [projectId, user]);

  // 初期データ読み込み
  useEffect(() => {
    loadInitialBoards();
  }, [loadInitialBoards]);

  // ボードの変更をリアルタイムで監視
  useEffect(() => {
    if (!projectId || !boards.length) return;

    const boardRefs = boards.map((board) =>
      ref(rtdb, `projectBoards/${projectId}/${board.id}`)
    );

    const unsubscribes = boardRefs.map((boardRef, index) =>
      onValue(boardRef, (snapshot) => {
        if (snapshot.exists()) {
          const updatedBoard = snapshot.val() as Board;

          // 表示中のボードを更新
          setBoards((prev) => {
            const boardIndex = prev.findIndex((b) => b.id === updatedBoard.id);
            if (boardIndex >= 0) {
              const newBoards = [...prev];
              newBoards[boardIndex] = updatedBoard;
              return newBoards;
            }
            return prev;
          });
        }
      })
    );

    return () => {
      unsubscribes.forEach((unsubscribe) => unsubscribe());
    };
  }, [projectId, boards.length]); // boards.lengthで依存関係を制限

  // ボード作成
  const createBoard = async () => {
    if (!projectId || !user) return;

    // プロジェクトのメンバーシップをチェック
    if (!isProjectMember(project, user.uid)) {
      console.error("User is not a member of this project");
      return;
    }

    const boardId = nanoid();
    const now = Date.now();
    const uniqueName = await generateNewBoardName(projectId);

    const board = {
      id: boardId,
      name: uniqueName,
      createdBy: user!.uid,
      createdAt: now,
      updatedAt: now,
      projectId: projectId,
    };

    const updates: { [key: string]: Board | string } = {};
    updates[`boards/${boardId}`] = board;
    updates[`projectBoards/${projectId}/${boardId}`] = board;

    const normalizedTitle = normalizeTitle(uniqueName);
    if (normalizedTitle) {
      updates[`boardTitleIndex/${projectId}/${normalizedTitle}`] = boardId;
    }

    await update(ref(rtdb), updates);

    addToRecentlyCreated(projectId, uniqueName, boardId);
    syncBoardToAlgoliaAsync(boardId, board);

    // 新しいボードを先頭に追加
    const newBoard = {
      ...board,
      metadata: { title: uniqueName },
    };
    setBoards((prev) => [newBoard, ...prev.slice(0, itemsPerLoad - 1)]); // 表示件数を維持

    // Navigate to the new board
    try {
      if (project?.slug) {
        navigate(`/${project.slug}/${encodeURIComponent(uniqueName)}`);
      } else {
        navigate(`/${boardId}`);
      }
    } catch (error) {
      console.error("Error navigating to board:", error);
      navigate(`/${boardId}`);
    }
  };

  // カーソルリスナー（既存のコードから）
  useEffect(() => {
    if (!boards.length) return;

    const unsubscribes: (() => void)[] = [];

    boards.forEach((board) => {
      const cursorsRef = ref(rtdb, `boardCursors/${board.id}`);
      const unsubscribe = onValue(cursorsRef, (snapshot) => {
        const data = snapshot.val();
        const activeCursors: Record<string, Cursor> = {};

        if (data) {
          const now = Date.now();
          const CURSOR_TIMEOUT = 30000; // 30 seconds

          Object.entries(data).forEach(
            ([cursorId, cursor]: [string, unknown]) => {
              const cursorData = cursor as {
                timestamp: number;
                x: number;
                y: number;
                name: string;
                fullName: string;
                color: string;
              };
              if (now - cursorData.timestamp < CURSOR_TIMEOUT) {
                const userId = cursorId.split("-")[0];
                if (
                  !activeCursors[userId] ||
                  cursorData.timestamp > activeCursors[userId].timestamp
                ) {
                  activeCursors[userId] = cursorData as Cursor;
                }
              }
            }
          );
        }

        setBoardCursors((prev) => ({
          ...prev,
          [board.id]: activeCursors,
        }));
      });

      unsubscribes.push(unsubscribe);
    });

    return () => {
      unsubscribes.forEach((unsubscribe) => unsubscribe());
    };
  }, [boards]);

  // Component to render individual user avatar with initials
  const UserAvatar = memo(({ cursor }: { cursor: any }) => {
    const userName =
      cursor.username || cursor.fullName?.split(" (")[0] || "User";
    const initials = userName
      .split(" ")
      .map((name: string) => name.charAt(0).toUpperCase())
      .slice(0, 2)
      .join("");

    return (
      <div
        className="member-avatar active"
        style={{
          backgroundColor: cursor.color,
          width: "28px",
          height: "28px",
        }}
        title={cursor.fullName}
      >
        <div
          style={{
            color: "white",
            fontSize: "11px",
            fontWeight: "bold",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: "100%",
            height: "100%",
          }}
        >
          {initials}
        </div>
      </div>
    );
  });

  // Component to render active members with user board thumbnails
  const ActiveMembers = memo(
    ({
      boardId,
      cursors,
    }: {
      boardId: string;
      cursors: Record<string, Cursor>;
    }) => {
      const activeUsers = Object.values(cursors);

      if (activeUsers.length === 0) {
        return null;
      }

      const maxDisplay = 3;
      const displayUsers = activeUsers.slice(0, maxDisplay);
      const remainingCount = activeUsers.length - maxDisplay;

      return (
        <div className="active-members">
          {displayUsers.map((cursor, index) => {
            const userName =
              cursor.username || cursor.fullName?.split(" (")[0] || "User";
            return <UserAvatar key={userName} cursor={cursor} />;
          })}
          {remainingCount > 0 && (
            <div
              className="member-avatar more"
              title={`+${remainingCount} more`}
            >
              +{remainingCount}
            </div>
          )}
        </div>
      );
    },
    (prevProps, nextProps) => {
      // Simple comparison - re-render if cursors object changes
      return (
        JSON.stringify(prevProps.cursors) === JSON.stringify(nextProps.cursors)
      );
    }
  );

  return (
    <div className="board-list">
      <div className="board-list-header">
        {/* キャッシュされたメンバーシップ状態を使用 */}
        {user &&
          (isMember === null ? (
            // ローディング中は仮のボタンを表示
            <button
              className="fab-new-board-btn"
              disabled
              style={{ opacity: 0.5 }}
            >
              <LuPlus />
              <span>Create New Board</span>
            </button>
          ) : (
            // メンバーシップ確認後に表示
            isMember && (
              <button className="fab-new-board-btn" onClick={createBoard}>
                <LuPlus />
                <span>Create New Board</span>
              </button>
            )
          ))}
      </div>

      {error && (
        <div className="error-message">
          {error}
          <button onClick={() => loadInitialBoards()}>Retry</button>
        </div>
      )}

      <div className="boards-grid">
        {boards.map((board) => {
          const hasUnread = hasBoardUnreadContent(board.id, board.updatedAt);

          return (
            <div key={board.id} className="board-card-wrapper">
              <Link
                to={
                  project?.slug
                    ? `/${project.slug}/${encodeURIComponent(board.name)}`
                    : `/${board.id}`
                }
                className="board-card"
                style={{ position: "relative" }}
                onClick={() => {
                  // ボードリンクをクリックした時に閲覧時刻を更新
                  import("../utils/boardViewHistory").then(
                    ({ updateBoardViewTime }) => {
                      updateBoardViewTime(board.id);
                    }
                  );
                }}
              >
                {hasUnread && (
                  <div
                    style={{
                      position: "absolute",
                      top: "0px",
                      right: "0px",
                      width: "0",
                      height: "0",
                      borderLeft: "12px solid transparent",
                      borderTop: "12px solid #96cc95",
                      zIndex: 10,
                      pointerEvents: "none",
                    }}
                    title="未読"
                  />
                )}
                <p className="board-name">
                  {board.isPinned ? "📌 " : ""}
                  {board.metadata?.title || board.name || ""}
                </p>
                {board.metadata?.thumbnailUrl ? (
                  <div className="board-thumbnail">
                    <LazyImage
                      src={board.metadata.thumbnailUrl}
                      alt={`${board.name} thumbnail`}
                      className="thumbnail-image"
                    />
                  </div>
                ) : (
                  <div className="board-card-content">
                    {board.metadata?.description && (
                      <p className="board-description">
                        {board.metadata.description}
                      </p>
                    )}
                  </div>
                )}
                <ActiveMembers
                  boardId={board.id}
                  cursors={boardCursors[board.id] || {}}
                />
              </Link>
            </div>
          );
        })}
      </div>

      {/* Infinite scroll trigger */}
      {hasMore && (
        <div
          ref={loadMoreRef}
          className="load-more-trigger"
          style={{ height: "50px", marginTop: "20px" }}
        ></div>
      )}
    </div>
  );
}
