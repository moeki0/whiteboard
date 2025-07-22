import { useState, useEffect, useCallback, useRef } from "react";
import {
  useParams,
  useNavigate,
  Link,
} from "react-router-dom";
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
// import { getTruePaginatedBoards } from "../utils/truePagination";
// import { updateBoardListItem } from "../utils/boardDataStructure";
import { ref, onValue, get, update } from "firebase/database";
import { rtdb } from "../config/firebase";
import { customAlphabet } from "nanoid";

interface InfiniteScrollBoardListProps {
  user: User | null;
  projectId?: string;
}

interface PaginationCursor {
  lastKey: string;
  lastValue: number;
  direction: "forward" | "backward";
}

export function InfiniteScrollBoardList({
  user,
  projectId: propProjectId,
}: InfiniteScrollBoardListProps) {
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
  const [allBoards, setAllBoards] = useState<Board[]>([]); // 全ボードデータ
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0); // 現在の表示位置

  // Refs
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const itemsPerLoad = 34; // 一度に読み込む件数

  const nanoid = customAlphabet(
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789",
    21
  );

  // 全ボードデータを読み込み
  const loadAllBoards = useCallback(async () => {
    if (!projectId) return;

    setLoading(true);
    setError(null);

    try {
      // プロジェクト情報を取得
      const projectRef = ref(rtdb, `projects/${projectId}`);
      const projectSnapshot = await get(projectRef);
      if (projectSnapshot.exists()) {
        const projectData = projectSnapshot.val();
        setProject(projectData);
        updateCurrentProject(projectId, projectData.name);
      } else {
        updateCurrentProject(projectId);
      }

      console.log("🚀 Loading all boards from projectBoards...");
      const startTime = performance.now();

      // projectBoardsから一括取得
      const boardsRef = ref(rtdb, `projectBoards/${projectId}`);
      const snapshot = await get(boardsRef);

      const queryTime = performance.now();
      console.log(`📋 Boards query: ${(queryTime - startTime).toFixed(2)}ms`);

      if (snapshot.exists()) {
        const boardsData = snapshot.val();
        const boardsArray = Object.values(boardsData) as Board[];

        // updatedAtで降順ソート（新しいものが上）
        console.log(
          "🔍 Before sort:",
          boardsArray.slice(0, 3).map((b) => ({
            name: b.name,
            updatedAt: b.updatedAt,
            updatedAtDate: b.updatedAt
              ? new Date(b.updatedAt).toLocaleString()
              : "undefined",
          }))
        );

        boardsArray.sort((a, b) => {
          // ピン留めされたボードを最優先
          if (a.isPinned && !b.isPinned) return -1;
          if (!a.isPinned && b.isPinned) return 1;
          
          // 両方ピン留めされている場合、または両方ピン留めされていない場合は、updatedAtで並び替え
          const aTime = a.updatedAt || a.createdAt || 0;
          const bTime = b.updatedAt || b.createdAt || 0;
          return bTime - aTime; // 新しいものが上
        });

        console.log(
          "🔍 After sort:",
          boardsArray.slice(0, 5).map((b) => ({
            name: b.name,
            isPinned: b.isPinned || false,
            updatedAt: b.updatedAt,
            updatedAtDate: b.updatedAt
              ? new Date(b.updatedAt).toLocaleString()
              : "undefined",
          }))
        );

        setAllBoards(boardsArray);

        // 最初の34件を表示
        const initialBoards = boardsArray.slice(0, itemsPerLoad);
        setBoards(initialBoards);
        setCurrentIndex(itemsPerLoad);
        setHasMore(boardsArray.length > itemsPerLoad);

        console.log(
          `✅ Loaded ${boardsArray.length} total boards, showing ${initialBoards.length} initially`
        );
        
        // デバッグ: 最初の数個のボードのメタデータを詳細確認
        console.log('🔍 Board metadata debug:', boardsArray.slice(0, 3).map(b => ({
          name: b.name,
          metadata: b.metadata,
          metadataDescription: b.metadata?.description,
          metadataTitle: b.metadata?.title,
          hasDescription: !!b.metadata?.description,
          hasThumbnail: !!b.metadata?.thumbnailUrl
        })));
      } else {
        setAllBoards([]);
        setBoards([]);
        setHasMore(false);
        console.log("No boards found");
      }
    } catch (err) {
      console.error("Failed to load boards:", err);
      setError("Failed to load boards");
    } finally {
      setLoading(false);
    }
  }, [projectId, updateCurrentProject]);

  // 追加データ読み込み（メモリ上の全データから次の14件を表示）
  const loadMoreData = useCallback(() => {
    if (loading || !hasMore || currentIndex >= allBoards.length) return;

    setLoading(true);

    // 少し遅延を入れてUIの反応を見せる
    setTimeout(() => {
      console.log("📥 Loading more boards from memory...");

      const nextBoards = allBoards.slice(
        currentIndex,
        currentIndex + itemsPerLoad
      );

      if (nextBoards.length > 0) {
        setBoards((prev) => [...prev, ...nextBoards]);
        setCurrentIndex((prev) => prev + itemsPerLoad);
        setHasMore(currentIndex + itemsPerLoad < allBoards.length);

        console.log(
          `✅ Loaded ${nextBoards.length} more boards (${
            currentIndex + nextBoards.length
          }/${allBoards.length})`
        );
      } else {
        setHasMore(false);
      }

      setLoading(false);
    }, 100); // 100ms遅延でスムーズなUX
  }, [loading, hasMore, currentIndex, allBoards]);

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

  // 初期データ読み込み
  useEffect(() => {
    loadAllBoards();
  }, [loadAllBoards]);

  // ボードの変更をリアルタイムで監視
  useEffect(() => {
    if (!projectId || !allBoards.length) return;

    const boardRefs = allBoards.map((board) =>
      ref(rtdb, `projectBoards/${projectId}/${board.id}`)
    );

    const unsubscribes = boardRefs.map((boardRef, index) =>
      onValue(boardRef, (snapshot) => {
        if (snapshot.exists()) {
          const updatedBoard = snapshot.val() as Board;

          // allBoardsを更新
          setAllBoards((prev) => {
            const newBoards = [...prev];
            newBoards[index] = updatedBoard;
            // 更新後に再ソート
            newBoards.sort((a, b) => {
              // ピン留めされたボードを最優先
              if (a.isPinned && !b.isPinned) return -1;
              if (!a.isPinned && b.isPinned) return 1;
              
              // 両方ピン留めされている場合、または両方ピン留めされていない場合は、updatedAtで並び替え
              const aTime = a.updatedAt || a.createdAt || 0;
              const bTime = b.updatedAt || b.createdAt || 0;
              return bTime - aTime;
            });
            return newBoards;
          });

          // 表示中のボードも更新
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
  }, [projectId, allBoards.length]); // allBoards.lengthで依存関係を制限

  // ボード作成
  const createBoard = async () => {
    if (!projectId || !user) return;

    // プロジェクトのメンバーシップをチェック
    if (!isProjectMember(project, user.uid)) {
      console.error('User is not a member of this project');
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
    setAllBoards((prev) => [newBoard, ...prev]);
    setBoards((prev) => [newBoard, ...prev.slice(0, itemsPerLoad - 1)]); // 34件を維持

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

          Object.entries(data).forEach(([cursorId, cursor]: [string, any]) => {
            if (now - cursor.timestamp < CURSOR_TIMEOUT) {
              const userId = cursorId.split("-")[0];
              if (
                !activeCursors[userId] ||
                cursor.timestamp > activeCursors[userId].timestamp
              ) {
                activeCursors[userId] = cursor as Cursor;
              }
            }
          });
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

  // Active Members Component (既存のコードから)
  const ActiveMembers = ({ boardId }: { boardId: string }) => {
    const cursors = boardCursors[boardId] || {};
    const activeUsers = Object.values(cursors);

    if (activeUsers.length === 0) return null;

    const maxDisplay = 3;
    const displayUsers = activeUsers.slice(0, maxDisplay);
    const remainingCount = activeUsers.length - maxDisplay;

    return (
      <div className="active-members">
        {displayUsers.map((cursor, index) => {
          const userId = cursor.fullName?.split(" (")[0] || "User";
          const initials = userId
            .split(" ")
            .map((name) => name.charAt(0).toUpperCase())
            .slice(0, 2)
            .join("");

          return (
            <div
              key={index}
              className="member-avatar active"
              style={{ backgroundColor: cursor.color }}
              title={cursor.fullName}
            >
              {initials}
            </div>
          );
        })}
        {remainingCount > 0 && (
          <div className="member-avatar more" title={`+${remainingCount} more`}>
            +{remainingCount}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="board-list">
      <div className="board-list-header">
        {user && isProjectMember(project, user.uid) && (
          <button className="fab-new-board-btn" onClick={createBoard}>
            <LuPlus />
            <span>Create New Board</span>
          </button>
        )}
      </div>

      {error && (
        <div className="error-message">
          {error}
          <button onClick={() => loadAllBoards()}>Retry</button>
        </div>
      )}

      <div className="boards-grid">
        {boards.map((board) => {
          const hasUnread = hasBoardUnreadContent(board.id, board.updatedAt);
          
          // デバッグ：未読状態をログ出力（最初の3個のみ）
          if (boards.indexOf(board) < 3) {
            console.log(`🔍 Unread debug for ${board.name}:`, {
              boardId: board.id,
              boardUpdatedAt: board.updatedAt,
              updatedAtDate: board.updatedAt ? new Date(board.updatedAt).toLocaleString() : 'undefined',
              hasUnread,
              lastViewTime: localStorage.getItem('maplap_board_view_history') 
                ? JSON.parse(localStorage.getItem('maplap_board_view_history') || '{}')[board.id] 
                : 'no history'
            });
          }

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
                  import('../utils/boardViewHistory').then(({ updateBoardViewTime }) => {
                    updateBoardViewTime(board.id);
                  });
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
                  {board.isPinned ? "📌 " : ""}{board.metadata?.title || board.name || ""}
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
                <ActiveMembers boardId={board.id} />
              </Link>
            </div>
          );
        })}
      </div>

      {/* Infinite scroll trigger */}
      {hasMore && <div ref={loadMoreRef} className="load-more-trigger"></div>}
    </div>
  );
}
