import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { StickyNote } from "./StickyNote";
import { v4 as uuidv4 } from "uuid";
import { rtdb } from "../config/firebase";
import { ref, onValue, set, remove, get } from "firebase/database";
import { LuMousePointer2 } from "react-icons/lu";
import { Header } from "./Header";

export function Board({ user }) {
  const { projectId, boardId } = useParams();
  const [notes, setNotes] = useState([]);
  const [activeNoteId, setActiveNoteId] = useState(null);
  const [nextZIndex, setNextZIndex] = useState(100);
  const [copiedNote, setCopiedNote] = useState(null);
  const [cursors, setCursors] = useState({});
  const [boardName, setBoardName] = useState("");
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editingBoardName, setEditingBoardName] = useState("");
  const [sessionId] = useState(() => Math.random().toString(36).substr(2, 9));
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
        const boardRef = ref(
          rtdb,
          `projectBoards/${projectId}/${boardId}/name`
        );
        await set(boardRef, editingBoardName.trim());
        setBoardName(editingBoardName.trim());
      } catch (error) {
        console.error("Error updating board name:", error);
        setEditingBoardName(boardName);
      }
    }
    setIsEditingTitle(false);
  };

  useEffect(() => {
    // Get board name
    const getBoardName = async () => {
      const boardRef = ref(rtdb, `projectBoards/${projectId}/${boardId}`);
      const boardSnapshot = await get(boardRef);
      if (boardSnapshot.exists()) {
        const name = boardSnapshot.val().name;
        setBoardName(name);
        setEditingBoardName(name);
      }
    };

    getBoardName();

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
      } else {
        setNotes([]);
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
      unsubscribeNotes();
      unsubscribeCursors();
    };
  }, [projectId, boardId, user.uid, sessionId]);

  const addNote = () => {
    const newNote = {
      content: "",
      x: Math.random() * (window.innerWidth - 250),
      y: Math.random() * (window.innerHeight - 250),
      color: "#ffeb3b",
      userId: user.uid,
      createdAt: Date.now(),
      zIndex: nextZIndex,
      width: 250,
      isDragging: false,
      draggedBy: null,
    };

    const noteId = uuidv4();
    const noteRef = ref(rtdb, `boardNotes/${boardId}/${noteId}`);
    set(noteRef, newNote);
    setNextZIndex((prev) => prev + 1);
  };

  const updateNote = (noteId, updates) => {
    const noteRef = ref(rtdb, `boardNotes/${boardId}/${noteId}`);
    const note = notes.find((n) => n.id === noteId);
    if (note) {
      const updatedNote = { ...note, ...updates };
      set(noteRef, updatedNote);
    }
  };

  const deleteNote = (noteId) => {
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
      const newNote = {
        ...copiedNote,
        x: copiedNote.x + 20,
        y: copiedNote.y + 20,
        userId: user.uid,
        createdAt: Date.now(),
        zIndex: nextZIndex,
      };

      const noteId = uuidv4();
      const noteRef = ref(rtdb, `boardNotes/${boardId}/${noteId}`);
      set(noteRef, newNote);
      setNextZIndex((prev) => prev + 1);
    }
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.ctrlKey || e.metaKey) {
        if (e.key === "c" && activeNoteId) {
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
  }, [activeNoteId, copiedNote, nextZIndex, user.uid]);

  // Mouse movement tracking
  useEffect(() => {
    let throttleTimer = null;

    const handleMouseMove = (e) => {
      if (throttleTimer) return;

      throttleTimer = setTimeout(() => {
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
          x: e.clientX,
          y: e.clientY,
          name: initials,
          fullName: `${userName} (${sessionId})`,
          color: cursorColor,
          timestamp: Date.now(),
        }).catch((error) => {
          console.error("Error updating cursor:", error);
        });
        throttleTimer = null;
      }, 100); // Throttle to 20fps
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
          />
        ))}

        {/* Render other sessions' cursors */}
        {Object.entries(cursors).map(([cursorId, cursor]) => (
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
        ))}
      </div>
      <button onClick={addNote} className="fab-add-btn">
        +
      </button>
    </div>
  );
}
