import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { StickyNote } from "./StickyNote";
import { customAlphabet } from "nanoid";
import { rtdb } from "../config/firebase";
import { ref, onValue, set, remove, get } from "firebase/database";
import { LuMousePointer2, LuPlus } from "react-icons/lu";
import { Header } from "./Header";
import { useHistory } from "../hooks/useHistory";

export function Board({ user }) {
  const { boardId } = useParams();
  const navigate = useNavigate();
  const [notes, setNotes] = useState([]);
  const [activeNoteId, setActiveNoteId] = useState(null);
  const [nextZIndex, setNextZIndex] = useState(100);
  const [copiedNote, setCopiedNote] = useState(null);
  const [cursors, setCursors] = useState({});
  const [boardName, setBoardName] = useState("");
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editingBoardName, setEditingBoardName] = useState("");
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [sessionId] = useState(() => Math.random().toString(36).substr(2, 9));
  const [projectId, setProjectId] = useState(null);
  const [isCheckingAccess, setIsCheckingAccess] = useState(true);
  const nanoid = customAlphabet(
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789",
    21
  );
  const { addToHistory, undo, redo } = useHistory();
  const [isUndoRedoOperation, setIsUndoRedoOperation] = useState(false);
  const [cursorColor] = useState(() => {
    const colors = [
      "#FF6B6B", // コーラルレッド
      "#4ECDC4", // ターコイズ
      "#45B7D1", // スカイブルー
      "#96CEB4", // ミントグリーン
      "#FFEAA7", // ライトイエロー
      "#DDA0DD", // プラム
      "#98D8C8", // アクアマリン
      "#F7DC6F", // バナナイエロー
      "#BB8FCE", // ライトパープル
      "#F8C471", // ピーチ
    ];
    // ユーザーIDから一意の色を決定
    const hash = user.uid
      .split("")
      .reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return colors[hash % colors.length];
  });

  const saveBoardName = async () => {
    if (!editingBoardName.trim()) {
      setEditingBoardName(boardName);
      setIsEditingTitle(false);
      return;
    }

    if (editingBoardName.trim() !== boardName) {
      try {
        const boardRef = ref(rtdb, `boards/${boardId}/name`);
        await set(boardRef, editingBoardName.trim());
        setBoardName(editingBoardName.trim());
      } catch (error) {
        console.error("Error updating board name:", error);
        setEditingBoardName(boardName);
      }
    }
    setIsEditingTitle(false);
  };

  // Check access permissions function
  const checkAccess = async (boardData) => {
    if (!boardData.isPublic && boardData.projectId) {
      const projectRef = ref(rtdb, `projects/${boardData.projectId}`);
      const projectSnapshot = await get(projectRef);

      if (projectSnapshot.exists()) {
        const projectData = projectSnapshot.val();
        const isMember = projectData.members?.[user.uid];

        if (!isMember) {
          alert(
            "This board is private. Only project members can access it."
          );
          navigate("/");
          return false;
        }
      }
    }
    return true;
  };

  useEffect(() => {
    // Get board info and project ID
    const getBoardInfo = async () => {
      const boardRef = ref(rtdb, `boards/${boardId}`);
      const boardSnapshot = await get(boardRef);
      if (boardSnapshot.exists()) {
        const boardData = boardSnapshot.val();
        setBoardName(boardData.name);
        setEditingBoardName(boardData.name);
        setProjectId(boardData.projectId);

        // Check initial access permissions
        const hasAccess = await checkAccess(boardData);
        if (!hasAccess) return;
        
        // Access check complete, allow rendering
        setIsCheckingAccess(false);
      }
    };

    getBoardInfo();

    // Listen to board changes for real-time access control
    const boardRef = ref(rtdb, `boards/${boardId}`);
    const unsubscribeBoard = onValue(boardRef, async (snapshot) => {
      if (snapshot.exists()) {
        const boardData = snapshot.val();
        setBoardName(boardData.name);
        setEditingBoardName(boardData.name);
        setProjectId(boardData.projectId);

        // Check access permissions in real-time
        if (!isCheckingAccess) {
          await checkAccess(boardData);
        }
      } else {
        // Board was deleted
        alert("This board has been deleted.");
        navigate("/");
      }
    });


    const notesRef = ref(rtdb, `boardNotes/${boardId}`);
    const cursorsRef = ref(rtdb, `boardCursors/${boardId}`);

    // Listen to notes changes
    const unsubscribeNotes = onValue(notesRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const notesArray = Object.entries(data).map(([id, note]) => ({
          id,
          ...note,
        }));
        setNotes(notesArray);

        // Update maxZIndex based on existing notes
        const maxZ = Math.max(...notesArray.map((n) => n.zIndex || 0), 99);
        setNextZIndex(maxZ + 1);

        // Remove auto-update board dimensions and centering logic
        if (isInitialLoad) {
          setIsInitialLoad(false);
        }
      } else {
        setNotes([]);
        setIsInitialLoad(false);
      }
    });

    // Listen to cursor changes
    const unsubscribeCursors = onValue(cursorsRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const cursorsObj = {};
        const now = Date.now();
        const CURSOR_TIMEOUT = 30000; // 30 seconds timeout

        Object.entries(data).forEach(([cursorId, cursor]) => {
          // Remove old cursors
          if (now - cursor.timestamp > CURSOR_TIMEOUT) {
            const oldCursorRef = ref(
              rtdb,
              `boardCursors/${boardId}/${cursorId}`
            );
            remove(oldCursorRef).catch(console.error);
            return;
          }

          if (cursorId !== `${user.uid}-${sessionId}`) {
            // Don't show own session cursor
            cursorsObj[cursorId] = cursor;
          }
        });
        setCursors(cursorsObj);
      } else {
        setCursors({});
      }
    });

    return () => {
      unsubscribeBoard();
      unsubscribeNotes();
      unsubscribeCursors();
    };
  }, [boardId, user.uid, sessionId, isInitialLoad]);

  // Listen to project membership changes for real-time access control
  useEffect(() => {
    if (!projectId) return;

    const projectRef = ref(rtdb, `projects/${projectId}/members/${user.uid}`);
    const unsubscribeProject = onValue(projectRef, async (snapshot) => {
      if (!snapshot.exists()) {
        // User was removed from project
        const boardRef = ref(rtdb, `boards/${boardId}`);
        const boardSnapshot = await get(boardRef);
        if (boardSnapshot.exists()) {
          const boardData = boardSnapshot.val();
          if (!boardData.isPublic) {
            alert("You have been removed from this project and can no longer access this private board.");
            navigate("/");
          }
        }
      }
    });

    return () => unsubscribeProject();
  }, [projectId, user.uid, boardId, navigate]);

  const addNote = () => {
    const app = document.querySelector(".app");
    const newNote = {
      content: "",
      x: Math.random() * (window.innerWidth - 250) + app.scrollLeft,
      y: Math.random() * (window.innerHeight - 250) + app.scrollTop,
      color: "#ffeb3b",
      userId: user.uid,
      createdAt: Date.now(),
      zIndex: nextZIndex,
      width: 250,
      isDragging: false,
      draggedBy: null,
    };

    const noteId = nanoid();

    // Add to history only if it's user's own action (not undo/redo)
    if (!isUndoRedoOperation) {
      addToHistory({
        type: "CREATE_NOTE",
        noteId: noteId,
        note: newNote,
        userId: user.uid,
      });
    }

    const noteRef = ref(rtdb, `boardNotes/${boardId}/${noteId}`);
    set(noteRef, newNote);
    setNextZIndex((prev) => prev + 1);
  };

  const updateNote = (noteId, updates) => {
    const noteRef = ref(rtdb, `boardNotes/${boardId}/${noteId}`);
    const note = notes.find((n) => n.id === noteId);
    if (note) {
      const updatedNote = { ...note, ...updates };

      // Add to history only for significant changes by the current user
      if (!isUndoRedoOperation && note.userId === user.uid) {
        // Only track position changes (not dragging state changes)
        if (updates.x !== undefined || updates.y !== undefined) {
          addToHistory({
            type: "MOVE_NOTE",
            noteId: noteId,
            oldPosition: { x: note.x, y: note.y },
            newPosition: { x: updates.x ?? note.x, y: updates.y ?? note.y },
            userId: user.uid,
          });
        }
        // Track content changes
        else if (
          updates.content !== undefined &&
          updates.content !== note.content
        ) {
          addToHistory({
            type: "EDIT_NOTE",
            noteId: noteId,
            oldContent: note.content,
            newContent: updates.content,
            userId: user.uid,
          });
        }
      }

      set(noteRef, updatedNote);
    }
  };

  const deleteNote = (noteId) => {
    const note = notes.find((n) => n.id === noteId);

    // Add to history only if it's user's own note and not undo/redo operation
    if (!isUndoRedoOperation && note && note.userId === user.uid) {
      addToHistory({
        type: "DELETE_NOTE",
        noteId: noteId,
        note: note,
        userId: user.uid,
      });
    }

    const noteRef = ref(rtdb, `boardNotes/${boardId}/${noteId}`);
    remove(noteRef);
    if (activeNoteId === noteId) {
      setActiveNoteId(null);
    }
  };

  const handleActivateNote = (noteId) => {
    setActiveNoteId(noteId);
    // Bring to front by updating zIndex
    const note = notes.find((n) => n.id === noteId);
    if (note) {
      updateNote(noteId, { zIndex: nextZIndex });
      setNextZIndex((prev) => prev + 1);
    }
  };

  const handleBoardClick = () => {
    setActiveNoteId(null);
  };

  const copyNote = (noteId) => {
    const note = notes.find((n) => n.id === noteId);
    if (note) {
      setCopiedNote(note);
    }
  };

  const pasteNote = () => {
    if (copiedNote) {
      // Remove id and other properties that should be unique
      const { ...noteData } = copiedNote;

      const newNote = {
        ...noteData,
        x: copiedNote.x + 20,
        y: copiedNote.y + 20,
        userId: user.uid,
        createdAt: Date.now(),
        zIndex: nextZIndex,
        isDragging: false,
        draggedBy: null,
        isEditing: false,
        editedBy: null,
      };

      const noteId = nanoid();
      const noteRef = ref(rtdb, `boardNotes/${boardId}/${noteId}`);
      set(noteRef, newNote);
      setNextZIndex((prev) => prev + 1);
    }
  };

  // Undo/Redo functions
  const performUndo = useCallback(() => {
    const action = undo();
    if (!action || action.userId !== user.uid) return;

    setIsUndoRedoOperation(true);

    try {
      const noteRef = ref(rtdb, `boardNotes/${boardId}/${action.noteId}`);
      const recreateRef = ref(rtdb, `boardNotes/${boardId}/${action.noteId}`);
      const moveRef = ref(rtdb, `boardNotes/${boardId}/${action.noteId}`);
      const note = notes.find((n) => n.id === action.noteId);
      const editRef = ref(rtdb, `boardNotes/${boardId}/${action.noteId}`);
      const editNote = notes.find((n) => n.id === action.noteId);
      switch (action.type) {
        case "CREATE_NOTE":
          remove(noteRef);
          break;

        case "DELETE_NOTE":
          set(recreateRef, action.note);
          break;

        case "MOVE_NOTE":
          if (note) {
            set(moveRef, { ...note, ...action.oldPosition });
          }
          break;

        case "EDIT_NOTE":
          if (editNote) {
            set(editRef, { ...editNote, content: action.oldContent });
          }
          break;
      }
    } finally {
      setTimeout(() => setIsUndoRedoOperation(false), 100);
    }
  }, [undo, user.uid, boardId, notes]);

  const performRedo = useCallback(() => {
    const action = redo();
    if (!action || action.userId !== user.uid) return;

    setIsUndoRedoOperation(true);

    try {
      const noteRef = ref(rtdb, `boardNotes/${boardId}/${action.noteId}`);
      const deleteRef = ref(rtdb, `boardNotes/${boardId}/${action.noteId}`);
      const moveRef = ref(rtdb, `boardNotes/${boardId}/${action.noteId}`);
      const note = notes.find((n) => n.id === action.noteId);
      const editRef = ref(rtdb, `boardNotes/${boardId}/${action.noteId}`);
      const editNote = notes.find((n) => n.id === action.noteId);
      switch (action.type) {
        case "CREATE_NOTE":
          set(noteRef, action.note);
          break;

        case "DELETE_NOTE":
          remove(deleteRef);
          break;

        case "MOVE_NOTE":
          if (note) {
            set(moveRef, { ...note, ...action.newPosition });
          }
          break;

        case "EDIT_NOTE":
          if (editNote) {
            set(editRef, { ...editNote, content: action.newContent });
          }
          break;
      }
    } finally {
      setTimeout(() => setIsUndoRedoOperation(false), 100);
    }
  }, [redo, user.uid, boardId, notes]);

  // Get user colors for notes - same logic as cursor color generation
  const getUserColor = useCallback((userId) => {
    const colors = [
      "#FF6B6B", // コーラルレッド
      "#4ECDC4", // ターコイズ
      "#45B7D1", // スカイブルー
      "#96CEB4", // ミントグリーン
      "#FFEAA7", // ライトイエロー
      "#DDA0DD", // プラム
      "#98D8C8", // アクアマリン
      "#F7DC6F", // バナナイエロー
      "#BB8FCE", // ライトパープル
      "#F8C471", // ピーチ
    ];

    // Use the same hash logic as cursor color
    const hash = userId
      .split("")
      .reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return colors[hash % colors.length];
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.ctrlKey || e.metaKey) {
        if (e.key === "z" && !e.shiftKey) {
          e.preventDefault();
          performUndo();
        } else if (e.key === "y" || (e.key === "z" && e.shiftKey)) {
          e.preventDefault();
          performRedo();
        } else if (e.key === "c" && activeNoteId) {
          e.preventDefault();
          copyNote(activeNoteId);
        } else if (e.key === "v" && copiedNote) {
          e.preventDefault();
          pasteNote();
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [
    activeNoteId,
    copiedNote,
    nextZIndex,
    user.uid,
    performUndo,
    performRedo,
  ]);

  // Mouse movement tracking
  useEffect(() => {
    let throttleTimer = null;

    const handleMouseMove = (e) => {
      if (throttleTimer) return;

      throttleTimer = setTimeout(() => {
        // Get scroll position to calculate relative cursor position
        const app = document.querySelector(".app");
        const scrollLeft = app?.scrollLeft || 0;
        const scrollTop = app?.scrollTop || 0;

        // Calculate cursor position relative to the board content
        const relativeX = e.clientX + scrollLeft;
        const relativeY = e.clientY + scrollTop;

        const cursorRef = ref(
          rtdb,
          `boardCursors/${boardId}/${user.uid}-${sessionId}`
        );
        const userName = user.displayName || user.email || "User";
        const initials = userName
          .split(" ")
          .map((word) => word.charAt(0).toUpperCase())
          .slice(0, 2)
          .join("");

        set(cursorRef, {
          x: relativeX,
          y: relativeY,
          name: initials,
          fullName: `${userName} (${sessionId})`,
          color: cursorColor,
          timestamp: Date.now(),
        }).catch((error) => {
          console.error("Error updating cursor:", error);
        });
        throttleTimer = null;
      }, 50); // Throttle to 20fps
    };

    document.addEventListener("mousemove", handleMouseMove);
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      if (throttleTimer) {
        clearTimeout(throttleTimer);
      }
    };
  }, [user]);

  // Cleanup cursor on unmount or page close
  useEffect(() => {
    const cleanup = () => {
      const cursorRef = ref(
        rtdb,
        `boardCursors/${boardId}/${user.uid}-${sessionId}`
      );
      remove(cursorRef).catch((error) => {
        console.error("Error removing cursor:", error);
      });
    };

    // Cleanup on component unmount
    return cleanup;
  }, [boardId, user.uid, sessionId]);

  // Cleanup cursor on page visibility change or beforeunload
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        const cursorRef = ref(
          rtdb,
          `boardCursors/${boardId}/${user.uid}-${sessionId}`
        );
        remove(cursorRef).catch((error) => {
          console.error("Error removing cursor on visibility change:", error);
        });
      }
    };

    const handleBeforeUnload = () => {
      const cursorRef = ref(
        rtdb,
        `boardCursors/${boardId}/${user.uid}-${sessionId}`
      );
      remove(cursorRef).catch((error) => {
        console.error("Error removing cursor on beforeunload:", error);
      });
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [boardId, user.uid, sessionId]);

  // Show loading state while checking access
  if (isCheckingAccess) {
    return <div className="loading">Loading...</div>;
  }

  return (
    <div className="board" onClick={handleBoardClick}>
      <Header user={user} currentProjectId={projectId}>
        <div className="board-title-edit">
          {isEditingTitle ? (
            <input
              type="text"
              value={editingBoardName}
              onChange={(e) => setEditingBoardName(e.target.value)}
              onKeyPress={(e) => e.key === "Enter" && saveBoardName()}
              onBlur={saveBoardName}
              autoFocus
              className="board-title-input"
            />
          ) : (
            <p
              onClick={() => setIsEditingTitle(true)}
              className="board-title"
              title="Click to edit"
            >
              {boardName}
            </p>
          )}
        </div>
      </Header>
      <div className="notes-container">
        {notes.map((note) => (
          <StickyNote
            key={note.id}
            note={note}
            onUpdate={updateNote}
            onDelete={deleteNote}
            isActive={activeNoteId === note.id}
            onActivate={handleActivateNote}
            currentUserId={user.uid}
            getUserColor={getUserColor}
          />
        ))}

        {/* Render other sessions' cursors */}
        {Object.entries(cursors).map(([cursorId, cursor]) => {
          return (
            <div
              key={cursorId}
              className="cursor"
              style={{
                left: `${cursor.x}px`,
                top: `${cursor.y}px`,
                position: "absolute",
                pointerEvents: "none",
                zIndex: 10000,
              }}
            >
              <div className="cursor-pointer">
                <LuMousePointer2
                  style={{
                    color: cursor.color || "#ff4444",
                    fill: cursor.color || "#ff4444",
                  }}
                />
              </div>
              <div
                className="cursor-label"
                style={{
                  backgroundColor: cursor.color || "#ff4444",
                }}
                title={cursor.fullName}
              >
                {cursor.name}
              </div>
            </div>
          );
        })}
      </div>
      <button onClick={addNote} className="fab-add-btn">
        <LuPlus />
      </button>
    </div>
  );
}
