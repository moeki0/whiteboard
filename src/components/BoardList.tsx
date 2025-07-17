import { useState, useEffect } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { rtdb } from "../config/firebase";
import { ref, onValue, set, get } from "firebase/database";
import { customAlphabet } from "nanoid";
import { useProject } from "../contexts/ProjectContext";
import { useSlug } from "../contexts/SlugContext";
import { getBoardInfo } from "../utils/boardInfo";
import { User, Board, Cursor, Project } from "../types";
import { LuPlus } from "react-icons/lu";
import { generateNewBoardName } from "../utils/boardNaming";

interface BoardListProps {
  user: User | null;
  projectId?: string;
}

export function BoardList({ user, projectId: propProjectId }: BoardListProps) {
  const { projectId: paramProjectId } = useParams();
  const { resolvedProjectId } = useSlug();
  const projectId = resolvedProjectId || propProjectId || paramProjectId;
  const navigate = useNavigate();
  const { updateCurrentProject } = useProject();
  const [boards, setBoards] = useState<Board[]>([]);
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

        // Get board IDs from projectBoards
        const projectBoardsRef = ref(rtdb, `projectBoards/${projectId}`);
        const projectBoardsSnapshot = await get(projectBoardsRef);
        const projectBoardsData = projectBoardsSnapshot.val();

        if (projectBoardsData) {
          const boardIds = Object.keys(projectBoardsData);

          // Fetch actual board data from boards collection
          const boardPromises = boardIds.map(async (boardId) => {
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

          const boardResults = await Promise.all(boardPromises);
          const validBoards = boardResults.filter((board) => board !== null);
          setBoards(
            validBoards.sort(
              (a, b) =>
                (b.updatedAt || b.createdAt) - (a.updatedAt || a.createdAt)
            )
          );

          // Get board info (titles, descriptions, thumbnails)
          const boardInfoPromises = validBoards.map(async (board) => {
            const boardInfo = await getBoardInfo(board.id);
            return { boardId: board.id, ...boardInfo };
          });

          const boardInfoResults = await Promise.all(boardInfoPromises);
          const thumbnailMap: Record<string, string> = {};
          const titleMap: Record<string, string> = {};
          const descriptionMap: Record<string, string> = {};

          boardInfoResults.forEach(
            ({ boardId, thumbnailUrl, title, description }) => {
              if (thumbnailUrl) {
                thumbnailMap[boardId] = thumbnailUrl;
              }
              if (title) {
                titleMap[boardId] = title;
              }
              if (description) {
                descriptionMap[boardId] = description;
              }
            }
          );

          setBoardThumbnails(thumbnailMap);
          setBoardTitles(titleMap);
          setBoardDescriptions(descriptionMap);

          // Get saved thumbnails from Firebase
          const savedThumbnailPromises = validBoards.map(async (board) => {
            const thumbnailRef = ref(rtdb, `boardThumbnails/${board.id}`);
            const thumbnailSnapshot = await get(thumbnailRef);
            if (thumbnailSnapshot.exists()) {
              return { boardId: board.id, url: thumbnailSnapshot.val().url };
            }
            return null;
          });

          const savedThumbnailResults = await Promise.all(
            savedThumbnailPromises
          );
          const savedThumbnailMap: Record<string, string> = {};
          savedThumbnailResults.forEach((result) => {
            if (result) {
              savedThumbnailMap[result.boardId] = result.url;
            }
          });

          setBoardThumbnails((prev) => ({ ...prev, ...savedThumbnailMap }));
        } else {
          setBoards([]);
          setBoardThumbnails({});
          setBoardTitles({});
          setBoardDescriptions({});
        }
      } catch (error) {
        console.error("Error loading boards:", error);
      }
    };

    loadBoards();
  }, [projectId, updateCurrentProject]);

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
    if (!projectId) return;

    const boardId = nanoid();
    const now = Date.now();

    // 重複しない一意なボード名を生成
    const uniqueName = await generateNewBoardName(projectId);

    const board = {
      name: uniqueName,
      createdBy: user!.uid,
      createdAt: now,
      updatedAt: now,
      projectId: projectId,
    };

    // Store board with both references
    const boardRef = ref(rtdb, `boards/${boardId}`);
    await set(boardRef, board);

    const projectBoardRef = ref(rtdb, `projectBoards/${projectId}/${boardId}`);
    await set(projectBoardRef, board);

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
  const ActiveMembers = ({ boardId }: { boardId: string }) => {
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
  };

  return (
    <div className="board-list">
      <div className="board-list-header">
        <button className="fab-new-board-btn" onClick={createBoard}>
          <LuPlus />
          <span>Create New Board</span>
        </button>
      </div>

      <div className="boards-grid">
        {boards.map((board) => (
          <div key={board.id} className="board-card-wrapper">
            <Link
              to={
                project?.slug
                  ? `/${project.slug}/${encodeURIComponent(board.name)}`
                  : `/${board.id}`
              }
              className="board-card"
            >
              <p className="board-name">{boardTitles[board.id] || ""}</p>
              {boardThumbnails[board.id] ? (
                <div className="board-thumbnail">
                  {boardThumbnails[board.id] ? (
                    <img
                      src={boardThumbnails[board.id]}
                      alt={`${board.name} thumbnail`}
                      className="thumbnail-image"
                    />
                  ) : (
                    <div className="thumbnail-placeholder"></div>
                  )}
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
        ))}
      </div>
    </div>
  );
}
