import { useState, useEffect } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { rtdb, auth } from "../config/firebase";
import { ref, onValue, set, remove, get } from "firebase/database";
import { signOut } from "firebase/auth";
import { v4 as uuidv4 } from "uuid";
import { Header } from "./Header";
import { useProject } from "../contexts/ProjectContext";
import { LuDelete, LuTrash, LuTrash2 } from "react-icons/lu";

export function BoardList({ user, projectId: propProjectId }) {
  const { projectId: paramProjectId } = useParams();
  const projectId = propProjectId || paramProjectId;
  const navigate = useNavigate();
  const { updateCurrentProject } = useProject();
  const [boards, setBoards] = useState([]);
  const [projectName, setProjectName] = useState("");
  const [isCreatingBoard, setIsCreatingBoard] = useState(false);
  const [newBoardName, setNewBoardName] = useState("");

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

    // Listen to project's boards
    const boardsRef = ref(rtdb, `projectBoards/${projectId}`);
    const unsubscribe = onValue(boardsRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const boardsArray = Object.entries(data).map(([id, board]) => ({
          id,
          ...board,
        }));
        setBoards(boardsArray.sort((a, b) => b.createdAt - a.createdAt));
      } else {
        setBoards([]);
      }
    });

    return () => unsubscribe();
  }, [projectId, updateCurrentProject]);

  const createBoard = async () => {
    const boardId = uuidv4();
    const board = {
      name: "Untitled",
      createdBy: user.uid,
      createdAt: Date.now(),
      projectId: projectId,
    };

    const boardRef = ref(rtdb, `projectBoards/${projectId}/${boardId}`);
    await set(boardRef, board);

    // Navigate to the new board immediately
    navigate(`/project/${projectId}/board/${boardId}`);
  };

  const deleteBoard = async (boardId) => {
    if (!window.confirm("Are you sure you want to delete this board?")) return;

    // Remove board
    const boardRef = ref(rtdb, `projectBoards/${projectId}/${boardId}`);
    await remove(boardRef);

    // Remove board notes and cursors
    const boardNotesRef = ref(rtdb, `boardNotes/${boardId}`);
    const boardCursorsRef = ref(rtdb, `boardCursors/${boardId}`);
    await remove(boardNotesRef);
    await remove(boardCursorsRef);
  };

  return (
    <div className="board-list">
      <Header title={projectName} user={user} currentProjectId={projectId}>
        <button
          className="fab-new-board-btn"
          onClick={createBoard}
          title="Create New Board"
        >
          +
        </button>
      </Header>

      <div className="boards-grid">
        {boards.map((board) => (
          <div key={board.id} className="board-card-wrapper">
            <Link
              to={`/project/${projectId}/board/${board.id}`}
              className="board-card"
            >
              <p>{board.name}</p>
              <LuTrash2
                className="delete-board-btn"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  deleteBoard(board.id);
                }}
                title="Delete Board"
              />
            </Link>
          </div>
        ))}
      </div>
    </div>
  );
}
