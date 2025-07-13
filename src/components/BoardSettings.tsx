import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { rtdb } from "../config/firebase";
import { ref, get, set, remove } from "firebase/database";
import { User, Board } from "../types";
import "./BoardSettings.css";

interface BoardSettingsProps {
  user: User;
}

export function BoardSettings({ user }: BoardSettingsProps) {
  const { boardId } = useParams();
  const navigate = useNavigate();
  const [board, setBoard] = useState<Board | null>(null);
  const [boardName, setBoardName] = useState("");
  const [isPublic, setIsPublic] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [hasAccess, setHasAccess] = useState(false);

  useEffect(() => {
    const loadBoardSettings = async () => {
      try {
        const boardRef = ref(rtdb, `boards/${boardId}`);
        const boardSnapshot = await get(boardRef);

        if (boardSnapshot.exists()) {
          const boardData = boardSnapshot.val();
          setBoard(boardData);
          setBoardName(boardData.name || "");
          setIsPublic(boardData.isPublic || false);

          // Check if user has access to this board
          if (boardData.projectId) {
            const projectRef = ref(rtdb, `projects/${boardData.projectId}`);
            const projectSnapshot = await get(projectRef);

            if (projectSnapshot.exists()) {
              const projectData = projectSnapshot.val();
              const userMember = projectData.members?.[user.uid];

              if (userMember) {
                setUserRole(userMember.role);
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

  const saveSettings = async () => {
    if (!boardName.trim()) {
      alert("Please enter a board name");
      return;
    }

    setIsSaving(true);
    try {
      const updates = {
        name: boardName.trim(),
        isPublic: isPublic,
        updatedAt: Date.now(),
      };

      const boardRef = ref(rtdb, `boards/${boardId}`);
      await set(boardRef, board ? { ...board, ...updates } : updates);

      // Also update in projectBoards for consistency
      if (board?.projectId) {
        const projectBoardRef = ref(
          rtdb,
          `projectBoards/${board.projectId}/${boardId}`
        );
        await set(projectBoardRef, { ...board, ...updates });
      }

      alert("Settings saved successfully!");
    } catch (error) {
      console.error("Error saving settings:", error);
      alert("Failed to save settings. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

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
        <div className="settings-section">
          <h2>Board Information</h2>
          <div className="settings-form">
            <div className="form-group">
              <label htmlFor="boardName">Board Name</label>
              <input
                id="boardName"
                type="text"
                value={boardName}
                onChange={(e) => setBoardName(e.target.value)}
                placeholder="Enter board name"
                maxLength={100}
                disabled={isSaving}
              />
            </div>
          </div>
        </div>

        <div className="settings-section">
          <h2>Privacy Settings</h2>
          <div className="settings-form">
            <div className="form-group">
              <div className="radio-group">
                <label className="radio-label">
                  <input
                    type="radio"
                    name="privacy"
                    checked={isPublic}
                    onChange={() => setIsPublic(true)}
                    disabled={isSaving}
                  />
                  <span className="radio-text">
                    <strong>Public</strong>
                    <small>
                      Anyone with the link can view and edit this board
                    </small>
                  </span>
                </label>
                <label className="radio-label">
                  <input
                    type="radio"
                    name="privacy"
                    checked={!isPublic}
                    onChange={() => setIsPublic(false)}
                    disabled={isSaving}
                  />
                  <span className="radio-text">
                    <strong>Private</strong>
                    <small>Only project members can access this board</small>
                  </span>
                </label>
              </div>
            </div>
          </div>
        </div>

        <div className="settings-actions">
          <button
            onClick={saveSettings}
            disabled={isSaving}
            className="save-btn"
          >
            {isSaving ? "Saving..." : "Save Settings"}
          </button>
          <button
            onClick={() => navigate(`/${boardId}`)}
            disabled={isSaving}
            className="cancel-btn"
          >
            Back to Board
          </button>
        </div>

        <div className="danger-zone">
          <h3>Danger Zone</h3>
          <p>
            Once you delete a board, there is no going back. Please be certain.
          </p>
          <button
            onClick={deleteBoard}
            disabled={isDeleting || isSaving}
            className="delete-btn"
          >
            {isDeleting ? "Deleting..." : "Delete Board"}
          </button>
        </div>
      </div>
    </div>
  );
}
