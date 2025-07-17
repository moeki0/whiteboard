import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { rtdb } from "../config/firebase";
import { ref, get, remove, set } from "firebase/database";
import { User, Board } from "../types";
import "./SettingsCommon.css";

interface BoardSettingsProps {
  user: User;
}

export function BoardSettings({ user }: BoardSettingsProps) {
  const { boardId } = useParams();
  const navigate = useNavigate();
  const [board, setBoard] = useState<Board | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isPinning, setIsPinning] = useState(false);
  const [hasAccess, setHasAccess] = useState(false);

  useEffect(() => {
    const loadBoardSettings = async () => {
      try {
        const boardRef = ref(rtdb, `boards/${boardId}`);
        const boardSnapshot = await get(boardRef);

        if (boardSnapshot.exists()) {
          const boardData = boardSnapshot.val();
          setBoard(boardData);

          // Check if user has access to this board
          if (boardData.projectId) {
            const projectRef = ref(rtdb, `projects/${boardData.projectId}`);
            const projectSnapshot = await get(projectRef);

            if (projectSnapshot.exists()) {
              const projectData = projectSnapshot.val();
              const userMember = projectData.members?.[user.uid];

              if (userMember) {
                setHasAccess(true);
              } else {
                setHasAccess(false);
              }
            } else {
              setHasAccess(false);
            }
          } else {
            // If no project, allow access for now
            setHasAccess(true);
          }
        } else {
          alert("Board not found");
          navigate("/");
        }
      } catch (error) {
        console.error("Error loading board settings:", error);
        alert("Failed to load board settings");
      } finally {
        setIsLoading(false);
      }
    };

    loadBoardSettings();
  }, [boardId, navigate]);

  const deleteBoard = async () => {
    if (
      !window.confirm(
        "Are you sure you want to delete this board? This action cannot be undone."
      )
    ) {
      return;
    }

    if (
      !window.confirm(
        "This will permanently delete all notes and data on this board. Are you absolutely sure?"
      )
    ) {
      return;
    }

    setIsDeleting(true);
    try {
      const boardRef = ref(rtdb, `boards/${boardId}`);
      await remove(boardRef);

      // Also remove from projectBoards for consistency
      if (board?.projectId) {
        const projectBoardRef = ref(
          rtdb,
          `projectBoards/${board.projectId}/${boardId}`
        );
        await remove(projectBoardRef);
      }

      // Remove board notes and cursors
      const boardNotesRef = ref(rtdb, `boardNotes/${boardId}`);
      const boardCursorsRef = ref(rtdb, `boardCursors/${boardId}`);
      await remove(boardNotesRef);
      await remove(boardCursorsRef);

      alert("Board deleted successfully");
      navigate("/");
    } catch (error) {
      console.error("Error deleting board:", error);
      alert("Failed to delete board. Please try again.");
    } finally {
      setIsDeleting(false);
    }
  };

  const togglePin = async () => {
    if (!board || !hasAccess) return;

    setIsPinning(true);
    try {
      const newPinnedState = !board.isPinned;
      
      // Update board in Firebase
      const boardRef = ref(rtdb, `boards/${boardId}`);
      await set(boardRef, { ...board, isPinned: newPinnedState });

      // Also update in projectBoards for consistency
      if (board.projectId) {
        const projectBoardRef = ref(rtdb, `projectBoards/${board.projectId}/${boardId}`);
        await set(projectBoardRef, { ...board, isPinned: newPinnedState });
      }

      // Update local state
      setBoard(prev => prev ? { ...prev, isPinned: newPinnedState } : null);
    } catch (error) {
      console.error("Error toggling pin:", error);
      alert("Failed to update pin status");
    } finally {
      setIsPinning(false);
    }
  };

  if (isLoading) {
    return <div className="loading"></div>;
  }

  if (!board) {
    return <div className="loading">Board not found</div>;
  }

  if (!hasAccess) {
    return (
      <div className="board-settings">
        <div className="settings-container">
          <div className="settings-section">
            <h2>Access Denied</h2>
            <p>
              You don't have permission to access this board's settings. Only
              project members can modify board settings.
            </p>
            <button
              onClick={() => navigate(`/${boardId}`)}
              className="cancel-btn"
            >
              Back to Board
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="board-settings">
      <div className="settings-container">
        {/* Board Actions */}
        <div className="settings-section">
          <h2>Board Actions</h2>
          <div className="setting-item">
            <label>Pin to Board List</label>
            <p>
              {board.isPinned 
                ? "Remove this board from the top of the board list"
                : "Pin this board to the top of the board list"
              }
            </p>
            <div>
              <button
                onClick={togglePin}
                disabled={isPinning}
                className={board.isPinned ? "cancel-btn" : "save-btn"}
              >
                {isPinning 
                  ? (board.isPinned ? "Unpinning..." : "Pinning...")
                  : (board.isPinned ? "Unpin Board" : "Pin Board to Top")
                }
              </button>
            </div>
          </div>
        </div>

        {/* Delete Board */}
        <div className="settings-section danger-zone">
          <h2>Delete Board</h2>
          <div className="setting-item">
            <div>
              <button
                onClick={deleteBoard}
                disabled={isDeleting}
                className="danger-btn"
              >
                Delete Board
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
