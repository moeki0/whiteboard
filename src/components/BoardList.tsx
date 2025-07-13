import { useState, useEffect } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { rtdb, auth } from "../config/firebase";
import { ref, onValue, set, remove, get } from "firebase/database";
import { signOut } from "firebase/auth";
import { customAlphabet } from "nanoid";
import { useProject } from "../contexts/ProjectContext";
import { User, Board, Cursor } from "../types";

interface BoardListProps {
  user: User | null;
  projectId?: string;
}

export function BoardList({ user, projectId: propProjectId }: BoardListProps) {
  const { projectId: paramProjectId } = useParams();
  const projectId = propProjectId || paramProjectId;
  const navigate = useNavigate();
  const { updateCurrentProject } = useProject();
  const [boards, setBoards] = useState<Board[]>([]);
  const [projectName, setProjectName] = useState<string>("");
  const [isCreatingBoard, setIsCreatingBoard] = useState<boolean>(false);
  const [newBoardName, setNewBoardName] = useState<string>("");
  const [boardCursors, setBoardCursors] = useState<
    Record<string, Record<string, Cursor>>
  >({});
  const nanoid = customAlphabet(
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789",
    21
  );

  useEffect(() => {
    if (!projectId) return;

    // Update current project in context
    updateCurrentProject(projectId);

    // Get project name
    const getProjectName = async () => {
      const projectRef = ref(rtdb, `projects/${projectId}`);
      const projectSnapshot = await get(projectRef);
      if (projectSnapshot.exists()) {
        setProjectName(projectSnapshot.val().name);
      }
    };

    getProjectName();

    // Listen to project's boards - get board IDs from projectBoards, then get actual data from boards
    const projectBoardsRef = ref(rtdb, `projectBoards/${projectId}`);
    const unsubscribe = onValue(projectBoardsRef, async (snapshot) => {
      const projectBoardsData = snapshot.val();
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
        setBoards(validBoards.sort((a, b) => b.createdAt - a.createdAt));
      } else {
        setBoards([]);
      }
    });

    return () => unsubscribe();
  }, [projectId, updateCurrentProject]);

  // Listen to cursors for all boards
  useEffect(() => {
    if (!boards.length) return;

    const unsubscribes: (() => void)[] = [];
    const newBoardCursors: Record<string, Record<string, Cursor>> = {};

    boards.forEach((board) => {
      const cursorsRef = ref(rtdb, `boardCursors/${board.id}`);
      const unsubscribe = onValue(cursorsRef, (snapshot) => {
        const data = snapshot.val();
        const activeCursors: Record<string, Cursor> = {};

        if (data) {
          const now = Date.now();
          const CURSOR_TIMEOUT = 30000; // 30 seconds

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
    const boardId = nanoid();
    const board = {
      name: "Untitled",
      createdBy: user!.uid,
      createdAt: Date.now(),
      projectId: projectId,
      isPublic: false, // Default to private
    };

    // Store board with both references
    const boardRef = ref(rtdb, `boards/${boardId}`);
    await set(boardRef, board);

    const projectBoardRef = ref(rtdb, `projectBoards/${projectId}/${boardId}`);
    await set(projectBoardRef, board);

    // Navigate to the new board immediately
    navigate(`/${boardId}`);
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
        <button
          className="fab-new-board-btn"
          onClick={createBoard}
          title="Create New Board"
        >
          Create New Board
        </button>
      </div>

      <div className="boards-grid">
        {boards.map((board) => (
          <div key={board.id} className="board-card-wrapper">
            <Link to={`/${board.id}`} className="board-card">
              <div className="board-card-content">
                <p className="board-name">{board.name}</p>
                <ActiveMembers boardId={board.id} />
              </div>
            </Link>
          </div>
        ))}
      </div>
    </div>
  );
}
