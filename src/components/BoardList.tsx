import { useState, useEffect, memo } from "react";
import { useParams, useNavigate, Link, useSearchParams } from "react-router-dom";
import { rtdb } from "../config/firebase";
import { ref, onValue, get, update } from "firebase/database";
import { customAlphabet } from "nanoid";
import { useProject } from "../contexts/ProjectContext";
import { useSlug } from "../contexts/SlugContext";
import { User, Board, Cursor, Project } from "../types";
import { LuPlus } from "react-icons/lu";
import { generateNewBoardName, addToRecentlyCreated } from "../utils/boardNaming";
import { syncBoardToAlgoliaAsync } from "../utils/algoliaSync";
import { normalizeTitle } from "../utils/boardTitleIndex";
import { hasBoardUnreadContent } from "../utils/boardViewHistory";
import { LazyImage } from "./LazyImage";
import { getPaginatedBoards, DenormalizedBoard } from "../utils/boardDataOptimizer";
import { updateBoardListItem } from "../utils/boardDataStructure";
import { isProjectMember } from "../utils/permissions";

interface BoardListProps {
  user: User | null;
  projectId?: string;
}

export function BoardList({ user, projectId: propProjectId }: BoardListProps) {
  const { projectId: paramProjectId } = useParams();
  const { resolvedProjectId } = useSlug();
  const projectId = resolvedProjectId || propProjectId || paramProjectId;
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { updateCurrentProject } = useProject();
  const [boards, setBoards] = useState<DenormalizedBoard[]>([]);
  const [boardCursors, setBoardCursors] = useState<
    Record<string, Record<string, Cursor>>
  >({});
  const [boardThumbnails, setBoardThumbnails] = useState<
    Record<string, string>
  >({});
  const [boardTitles, setBoardTitles] = useState<Record<string, string>>({});
  const [boardDescriptions, setBoardDescriptions] = useState<
    Record<string, string>
  >({});
  const [project, setProject] = useState<Project | null>(null);
  const [totalCount, setTotalCount] = useState(0);
  const [allBoardIds, setAllBoardIds] = useState<string[]>([]);
  const [cachedBoards, setCachedBoards] = useState<Record<string, DenormalizedBoard>>({});
  const itemsPerPage = 14;
  
  // Get current page from URL query params
  const pageFromUrl = parseInt(searchParams.get('page') || '1', 10);
  const currentPage = isNaN(pageFromUrl) || pageFromUrl < 1 ? 1 : pageFromUrl;
  const nanoid = customAlphabet(
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789",
    21
  );

  useEffect(() => {
    if (!projectId) return;

    const loadBoards = async () => {
      try {
        // Get project data and update context
        const projectRef = ref(rtdb, `projects/${projectId}`);
        const projectSnapshot = await get(projectRef);
        if (projectSnapshot.exists()) {
          const projectData = projectSnapshot.val();
          setProject(projectData);
          updateCurrentProject(projectId, projectData.name);
        } else {
          updateCurrentProject(projectId);
        }

        // Use optimized query
        const result = await getPaginatedBoards(projectId, currentPage, itemsPerPage);
        
        setBoards(result.boards);
        setAllBoardIds(result.allBoardIds);
        setTotalCount(result.totalCount);

        // Get board metadata from optimized data
        const thumbnailMap: Record<string, string> = {};
        const titleMap: Record<string, string> = {};
        const descriptionMap: Record<string, string> = {};

        result.boards.forEach((board) => {
          // Use denormalized data
          if (board.title) {
            titleMap[board.id] = board.title;
          }
          if (board.description) {
            descriptionMap[board.id] = board.description;
          }
          if (board.thumbnailUrl) {
            thumbnailMap[board.id] = board.thumbnailUrl;
          }
        });

        setBoardThumbnails(thumbnailMap);
        setBoardTitles(titleMap);
        setBoardDescriptions(descriptionMap);
      } catch (error) {
        console.error("Error loading boards:", error);
      }
    };

    if (currentPage === 1) {
      // Reset board IDs when project changes
      setAllBoardIds([]);
    }
    loadBoards();
  }, [projectId, currentPage, updateCurrentProject]);

  // Prefetch next page data
  useEffect(() => {
    if (!projectId || !allBoardIds.length) return;
    
    const prefetchNextPage = async () => {
      const nextPageStart = currentPage * itemsPerPage;
      const nextPageEnd = nextPageStart + itemsPerPage;
      const nextPageIds = allBoardIds.slice(nextPageStart, nextPageEnd);
      
      if (nextPageIds.length === 0) return;
      
      // Check if we already have cached data
      const uncachedIds = nextPageIds.filter(id => !cachedBoards[id]);
      if (uncachedIds.length === 0) return;
      
      // Fetch uncached boards
      const boardPromises = uncachedIds.map(async (boardId) => {
        const boardRef = ref(rtdb, `boards/${boardId}`);
        const boardSnapshot = await get(boardRef);
        if (boardSnapshot.exists()) {
          return {
            id: boardId,
            ...boardSnapshot.val(),
          };
        }
        return null;
      });
      
      const results = await Promise.all(boardPromises);
      const validBoards = results.filter(board => board !== null);
      
      // Update cache
      setCachedBoards(prev => {
        const newCache = { ...prev };
        validBoards.forEach(board => {
          if (board) newCache[board.id] = board;
        });
        return newCache;
      });
    };
    
    // Delay prefetch slightly to prioritize current page
    const timer = setTimeout(prefetchNextPage, 500);
    return () => clearTimeout(timer);
  }, [projectId, currentPage, allBoardIds, cachedBoards, itemsPerPage]);

  // Listen to cursors for all boards
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

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          Object.entries(data).forEach(([cursorId, cursor]: [string, any]) => {
            // Only show recent cursors (active users)
            if (now - cursor.timestamp < CURSOR_TIMEOUT) {
              // Extract userId from cursorId (format: userId-sessionId)
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

  const createBoard = async () => {
    if (!projectId || !user) return;

    // プロジェクトのメンバーシップをチェック
    if (!isProjectMember(project, user.uid)) {
      console.error('User is not a member of this project');
      return;
    }

    const boardId = nanoid();
    const now = Date.now();

    // 重複しない一意なボード名を生成
    const uniqueName = await generateNewBoardName(projectId);

    const board = {
      id: boardId,
      name: uniqueName,
      createdBy: user!.uid,
      createdAt: now,
      updatedAt: now,
      projectId: projectId,
    };

    // バッチ更新で全てのデータを一度に書き込み
    const updates: { [key: string]: Board | string } = {};
    updates[`boards/${boardId}`] = board;
    updates[`projectBoards/${projectId}/${boardId}`] = board;
    
    // タイトルインデックスも同時に作成
    const normalizedTitle = normalizeTitle(uniqueName);
    if (normalizedTitle) {
      updates[`boardTitleIndex/${projectId}/${normalizedTitle}`] = boardId;
    }
    
    await update(ref(rtdb), updates);
    
    // 新しいデータ構造にも追加
    try {
      await updateBoardListItem(projectId, boardId, board);
    } catch (error) {
      console.warn('Failed to update new board structure:', error);
    }
    
    // 作成したボードをキャッシュに追加
    addToRecentlyCreated(projectId, uniqueName, boardId);

    // Sync to Algolia asynchronously (non-blocking)
    syncBoardToAlgoliaAsync(boardId, board);

    // Navigate to the new board using slug-based URL
    try {
      const projectRef = ref(rtdb, `projects/${projectId}`);
      const projectSnapshot = await get(projectRef);

      if (projectSnapshot.exists()) {
        const projectData = projectSnapshot.val();
        if (projectData.slug) {
          navigate(`/${projectData.slug}/${encodeURIComponent(uniqueName)}`);
        } else {
          // Fallback to legacy route
          navigate(`/${boardId}`);
        }
      } else {
        // Fallback to legacy route
        navigate(`/${boardId}`);
      }
    } catch (error) {
      console.error("Error navigating to board:", error);
      // Fallback to legacy route
      navigate(`/${boardId}`);
    }
  };

  // Component to render active members for a board
  const ActiveMembers = memo(({ boardId }: { boardId: string }) => {
    const cursors = boardCursors[boardId] || {};
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
  });

  // Calculate pagination based on total count from Firebase
  const totalPages = Math.ceil(totalCount / itemsPerPage);

  const handlePageChange = (page: number) => {
    // Update URL with new page number
    const newSearchParams = new URLSearchParams(searchParams);
    if (page === 1) {
      newSearchParams.delete('page');
    } else {
      newSearchParams.set('page', page.toString());
    }
    setSearchParams(newSearchParams);
  };

  const renderPagination = () => {
    if (totalPages <= 1) return null;

    const pageNumbers = [];
    const maxVisiblePages = 5;
    let startPage = Math.max(1, currentPage - Math.floor(maxVisiblePages / 2));
    let endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);

    if (endPage - startPage < maxVisiblePages - 1) {
      startPage = Math.max(1, endPage - maxVisiblePages + 1);
    }

    for (let i = startPage; i <= endPage; i++) {
      pageNumbers.push(i);
    }

    return (
      <div className="pagination">
        {currentPage > 1 && (
          <button
            className="pagination-btn"
            onClick={() => handlePageChange(currentPage - 1)}
          >
            Previous
          </button>
        )}
        
        {startPage > 1 && (
          <>
            <button
              className="pagination-btn"
              onClick={() => handlePageChange(1)}
            >
              1
            </button>
            {startPage > 2 && <span className="pagination-ellipsis">...</span>}
          </>
        )}

        {pageNumbers.map((page) => (
          <button
            key={page}
            className={`pagination-btn ${page === currentPage ? 'active' : ''}`}
            onClick={() => handlePageChange(page)}
          >
            {page}
          </button>
        ))}

        {endPage < totalPages && (
          <>
            {endPage < totalPages - 1 && <span className="pagination-ellipsis">...</span>}
            <button
              className="pagination-btn"
              onClick={() => handlePageChange(totalPages)}
            >
              {totalPages}
            </button>
          </>
        )}

        {currentPage < totalPages && (
          <button
            className="pagination-btn"
            onClick={() => handlePageChange(currentPage + 1)}
          >
            Next
          </button>
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
                style={{ position: 'relative' }}
                onClick={() => {
                  // ボードリンクをクリックした時に閲覧時刻を更新
                  import('../utils/boardViewHistory').then(({ updateBoardViewTime }) => {
                    updateBoardViewTime(board.id);
                  });
                }}
              >
                {/* 未読ラベル（三角） */}
                {hasUnread && (
                  <div
                    style={{
                      position: 'absolute',
                      top: '0px',
                      right: '0px',
                      width: '0',
                      height: '0',
                      borderLeft: '12px solid transparent',
                      borderTop: '12px solid #96cc95',
                      zIndex: 10,
                      pointerEvents: 'none',
                    }}
                    title="未読"
                  />
                )}
                <p className="board-name">{boardTitles[board.id] || ""}</p>
              {boardThumbnails[board.id] ? (
                <div className="board-thumbnail">
                  <LazyImage
                    src={boardThumbnails[board.id]}
                    alt={`${board.name} thumbnail`}
                    className="thumbnail-image"
                  />
                </div>
              ) : (
                <div className="board-card-content">
                  {boardDescriptions[board.id] && (
                    <p className="board-description">
                      {boardDescriptions[board.id]}
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

      {renderPagination()}
    </div>
  );
}
