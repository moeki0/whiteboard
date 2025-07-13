import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { customAlphabet } from "nanoid";
import { rtdb } from "../config/firebase";
import { ref, onValue, set, remove, get } from "firebase/database";
import { LuPlus } from "react-icons/lu";
import { StickyNote } from "./StickyNote";
import { Header } from "./Header";
import { BoardTitle } from "./BoardTitle";
import { CursorDisplay } from "./CursorDisplay";
import { useHistory } from "../hooks/useHistory";
import { useBoard } from "../hooks/useBoard";
import { useCursor } from "../hooks/useCursor";
import { getUserColor } from "../utils/colors";
import { FirebaseUtils } from "../utils/firebase";
import { User, Note } from "../types";

interface BoardProps {
  user: User;
}

export function Board({ user }: BoardProps) {
  const navigate = useNavigate();
  const [activeNoteId, setActiveNoteId] = useState<string | null>(null);
  const [nextZIndex, setNextZIndex] = useState<number>(100);
  const [copiedNote, setCopiedNote] = useState<Note | null>(null);
  const [sessionId] = useState<string>(() =>
    Math.random().toString(36).substr(2, 9)
  );
  const [isUndoRedoOperation, setIsUndoRedoOperation] =
    useState<boolean>(false);
  const [currentUndoRedoNoteId, setCurrentUndoRedoNoteId] = useState<
    string | null
  >(null);

  const nanoid = customAlphabet(
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789",
    21
  );

  const { addToHistory, undo, redo } = useHistory();
  const {
    boardId,
    notes,
    cursors,
    boardName,
    projectId,
    isCheckingAccess,
    isEditingTitle,
    editingBoardName,
    setIsEditingTitle,
    setEditingBoardName,
    saveBoardName,
  } = useBoard(user, navigate, sessionId);

  const cursorColor = getUserColor(user.uid);

  // Use cursor tracking hook
  useCursor({
    boardId,
    user,
    sessionId,
    cursorColor,
  });

  // Update maxZIndex when notes change
  useEffect(() => {
    if (notes.length > 0) {
      const maxZ = Math.max(...notes.map((n) => n.zIndex || 0), 99);
      setNextZIndex(maxZ + 1);
    }
  }, [notes]);

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
            alert(
              "You have been removed from this project and can no longer access this private board."
            );
            navigate("/");
          }
        }
      }
    });

    return () => unsubscribeProject();
  }, [projectId, user.uid, boardId, navigate]);

  const addNote = () => {
    const app = document.querySelector(".app") as HTMLElement;
    const newNote: Omit<Note, "id"> = {
      content: "",
      x: Math.random() * (window.innerWidth - 250) + (app?.scrollLeft || 0),
      y: Math.random() * (window.innerHeight - 250) + (app?.scrollTop || 0),
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
        note: { ...newNote, id: noteId },
        userId: user.uid,
      });
    }

    const noteRef = ref(rtdb, `boardNotes/${boardId}/${noteId}`);
    set(noteRef, newNote);
    setNextZIndex((prev) => prev + 1);
  };

  const updateNote = (noteId: string, updates: Partial<Note>) => {
    const noteRef = ref(rtdb, `boardNotes/${boardId}/${noteId}`);
    const note = notes.find((n) => n.id === noteId);
    if (note) {
      const updatedNote = { ...note, ...updates };

      // Add to history only for significant changes by the current user
      // Skip history tracking if this is an undo/redo operation for this specific note
      if (
        !isUndoRedoOperation &&
        note.userId === user.uid &&
        currentUndoRedoNoteId !== noteId
      ) {
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

  const deleteNote = (noteId: string) => {
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

  const handleActivateNote = (noteId: string) => {
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

  const copyNote = (noteId: string) => {
    const note = notes.find((n) => n.id === noteId);
    if (note) {
      setCopiedNote(note);
    }
  };

  const pasteNote = () => {
    if (copiedNote) {
      // Remove id and other properties that should be unique
      const { id, ...noteData } = copiedNote;

      const newNote: Omit<Note, "id"> = {
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
    setCurrentUndoRedoNoteId(action.noteId);

    try {
      const noteRef = ref(rtdb, `boardNotes/${boardId}/${action.noteId}`);
      const note = notes.find((n) => n.id === action.noteId);

      switch (action.type) {
        case "CREATE_NOTE":
          remove(noteRef);
          break;

        case "DELETE_NOTE":
          set(noteRef, action.note);
          break;

        case "MOVE_NOTE":
          if (note) {
            set(noteRef, { ...note, ...action.oldPosition });
          }
          break;

        case "EDIT_NOTE":
          if (note) {
            set(noteRef, { ...note, content: action.oldContent });
          }
          break;
      }
    } finally {
      setTimeout(() => {
        setIsUndoRedoOperation(false);
        setCurrentUndoRedoNoteId(null);
      }, 500);
    }
  }, [undo, user.uid, boardId, notes]);

  const performRedo = useCallback(() => {
    const action = redo();
    if (!action || action.userId !== user.uid) return;

    setIsUndoRedoOperation(true);
    setCurrentUndoRedoNoteId(action.noteId);

    try {
      const noteRef = ref(rtdb, `boardNotes/${boardId}/${action.noteId}`);
      const note = notes.find((n) => n.id === action.noteId);

      switch (action.type) {
        case "CREATE_NOTE":
          set(noteRef, action.note);
          break;

        case "DELETE_NOTE":
          remove(noteRef);
          break;

        case "MOVE_NOTE":
          if (note) {
            set(noteRef, { ...note, ...action.newPosition });
          }
          break;

        case "EDIT_NOTE":
          if (note) {
            set(noteRef, { ...note, content: action.newContent });
          }
          break;
      }
    } finally {
      setTimeout(() => {
        setIsUndoRedoOperation(false);
        setCurrentUndoRedoNoteId(null);
      }, 500);
    }
  }, [redo, user.uid, boardId, notes]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
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

  // Show loading state while checking access
  if (isCheckingAccess) {
    return <div className="loading"></div>;
  }

  return (
    <div className="board" onClick={handleBoardClick}>
      <Header user={user}>
        <div className="board-title-edit">
          <BoardTitle
            isEditingTitle={isEditingTitle}
            editingBoardName={editingBoardName}
            boardName={boardName}
            onEditStart={() => setIsEditingTitle(true)}
            onEditChange={setEditingBoardName}
            onEditSave={saveBoardName}
          />
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

        <CursorDisplay cursors={cursors} />
      </div>
      <button onClick={addNote} className="fab-add-btn">
        <LuPlus />
      </button>
    </div>
  );
}
