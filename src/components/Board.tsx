import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { customAlphabet } from "nanoid";
import { rtdb } from "../config/firebase";
import { ref, onValue, set, remove, get } from "firebase/database";
import { LuPlus } from "react-icons/lu";
import { StickyNote } from "./StickyNote";
import { BoardTitle } from "./BoardTitle";
import { CursorDisplay } from "./CursorDisplay";
import { useHistory } from "../hooks/useHistory";
import { useBoard } from "../hooks/useBoard";
import { useCursor } from "../hooks/useCursor";
import { getUserColor } from "../utils/colors";
import { FirebaseUtils } from "../utils/firebase";
import { copyStickyNoteToClipboard, copyMultipleStickyNotesToClipboard } from "../utils/clipboardUtils";
import { User, Note } from "../types";

interface BoardProps {
  user: User;
}

export function Board({ user }: BoardProps) {
  const navigate = useNavigate();
  const [activeNoteId, setActiveNoteId] = useState<string | null>(null);
  const [selectedNoteIds, setSelectedNoteIds] = useState<Set<string>>(
    new Set()
  );
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

  // 範囲選択用の状態
  const [isSelecting, setIsSelecting] = useState<boolean>(false);
  const [selectionStart, setSelectionStart] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const [selectionEnd, setSelectionEnd] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const [isMultiSelectMode, setIsMultiSelectMode] = useState<boolean>(false);
  const [justFinishedSelection, setJustFinishedSelection] =
    useState<boolean>(false);

  // 一括移動用の状態
  const [isDraggingMultiple, setIsDraggingMultiple] = useState<boolean>(false);
  const [dragStartPos, setDragStartPos] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const [initialSelectedPositions, setInitialSelectedPositions] = useState<
    Record<string, { x: number; y: number }>
  >({});
  const [justFinishedBulkDrag, setJustFinishedBulkDrag] =
    useState<boolean>(false);

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

  const handleActivateNote = (
    noteId: string,
    isMultiSelect: boolean = false
  ) => {
    // 一括ドラッグ直後や範囲選択直後はアクティベートを無視
    if (isDraggingMultiple || justFinishedBulkDrag || justFinishedSelection) {
      return;
    }

    if (isMultiSelect) {
      // Ctrl/Cmdキーが押されている場合は複数選択
      const newSelectedIds = new Set(selectedNoteIds);
      if (newSelectedIds.has(noteId)) {
        newSelectedIds.delete(noteId);
      } else {
        newSelectedIds.add(noteId);
      }
      setSelectedNoteIds(newSelectedIds);

      // 最後に選択された付箋をアクティブにする
      if (newSelectedIds.has(noteId)) {
        setActiveNoteId(noteId);
      } else if (newSelectedIds.size > 0) {
        setActiveNoteId(Array.from(newSelectedIds)[newSelectedIds.size - 1]);
      } else {
        setActiveNoteId(null);
      }
    } else {
      // 通常の単一選択
      setActiveNoteId(noteId);
      setSelectedNoteIds(new Set([noteId]));
    }

    // Bring to front by updating zIndex
    const note = notes.find((n) => n.id === noteId);
    if (note) {
      updateNote(noteId, { zIndex: nextZIndex });
      setNextZIndex((prev) => prev + 1);
    }
  };

  const handleBoardClick = (e: React.MouseEvent<HTMLDivElement>) => {
    // 範囲選択終了直後や一括ドラッグ終了直後はクリックを無視
    if (isSelecting || justFinishedSelection || justFinishedBulkDrag) {
      return;
    }

    setActiveNoteId(null);
    setSelectedNoteIds(new Set());
  };

  // 範囲選択の開始
  const handleBoardMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    // 付箋やボタンをクリックした場合は範囲選択しない
    const target = e.target as HTMLElement;
    if (target.closest(".sticky-note") || target.closest("button")) {
      return;
    }

    const app = document.querySelector(".app") as HTMLElement;
    const rect = app?.getBoundingClientRect() || { left: 0, top: 0 };
    const x = e.clientX - rect.left + (app?.scrollLeft || 0);
    const y = e.clientY - rect.top + (app?.scrollTop || 0);

    const isMultiSelect = e.ctrlKey || e.metaKey;

    setIsSelecting(true);
    setIsMultiSelectMode(isMultiSelect);
    setSelectionStart({ x, y });
    setSelectionEnd({ x, y });
    setJustFinishedSelection(false); // 新しい選択開始時にフラグをクリア

    // Ctrlキーが押されていない場合は既存の選択をクリア
    if (!isMultiSelect) {
      setSelectedNoteIds(new Set());
      setActiveNoteId(null);
    }
  };

  // 範囲選択の更新
  const handleBoardMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!isSelecting || !selectionStart) return;

      const app = document.querySelector(".app") as HTMLElement;
      const rect = app?.getBoundingClientRect() || { left: 0, top: 0 };
      const x = e.clientX - rect.left + (app?.scrollLeft || 0);
      const y = e.clientY - rect.top + (app?.scrollTop || 0);

      setSelectionEnd({ x, y });

      // 選択範囲内の付箋を取得
      const minX = Math.min(selectionStart.x, x);
      const maxX = Math.max(selectionStart.x, x);
      const minY = Math.min(selectionStart.y, y);
      const maxY = Math.max(selectionStart.y, y);

      const notesInSelection = notes.filter((note) => {
        const noteX = note.x;
        const noteY = note.y;
        const noteWidth = note.width || 250;
        const noteHeight = 100; // 推定高さ

        return (
          noteX + noteWidth >= minX &&
          noteX <= maxX &&
          noteY + noteHeight >= minY &&
          noteY <= maxY
        );
      });

      // 範囲選択による選択状態を設定
      const newSelectedIds = new Set<string>();

      // マルチセレクトモードの場合は既存の選択を保持
      if (isMultiSelectMode) {
        selectedNoteIds.forEach((id) => newSelectedIds.add(id));
      }

      // 範囲選択された付箋を追加
      notesInSelection.forEach((note) => newSelectedIds.add(note.id));

      setSelectedNoteIds(newSelectedIds);
    },
    [isSelecting, selectionStart, notes, isMultiSelectMode, selectedNoteIds]
  );

  // 範囲選択の終了
  const handleBoardMouseUp = useCallback(() => {
    if (isSelecting && selectionStart && selectionEnd) {
      // 実際にドラッグが行われたかを確認（5px以上の移動で選択とみなす）
      const dragDistance = Math.sqrt(
        Math.pow(selectionEnd.x - selectionStart.x, 2) +
          Math.pow(selectionEnd.y - selectionStart.y, 2)
      );

      const wasActualDrag = dragDistance > 5;

      setIsSelecting(false);
      setSelectionStart(null);
      setSelectionEnd(null);
      setIsMultiSelectMode(false);

      if (wasActualDrag) {
        setJustFinishedSelection(true);
        // 少し後にフラグをクリア
        setTimeout(() => {
          setJustFinishedSelection(false);
        }, 200);
      }
    }
  }, [isSelecting, selectionStart, selectionEnd]);

  // 一括移動の開始
  const startBulkDrag = (
    noteId: string,
    e: React.MouseEvent<HTMLDivElement>
  ) => {
    if (!selectedNoteIds.has(noteId)) {
      return;
    }

    setIsDraggingMultiple(true);
    setDragStartPos({ x: e.clientX, y: e.clientY });
    setJustFinishedBulkDrag(false); // 新しいドラッグ開始時にフラグをクリア

    // 選択された付箋の初期位置を記録
    const positions: Record<string, { x: number; y: number }> = {};
    selectedNoteIds.forEach((id) => {
      const note = notes.find((n) => n.id === id);
      if (note) {
        positions[id] = { x: note.x, y: note.y };
      }
    });
    setInitialSelectedPositions(positions);
  };

  // 一括移動の処理
  const handleBulkDragMove = useCallback(
    (e: MouseEvent) => {
      if (!isDraggingMultiple || !dragStartPos) return;

      const deltaX = e.clientX - dragStartPos.x;
      const deltaY = e.clientY - dragStartPos.y;

      selectedNoteIds.forEach((noteId) => {
        const initialPos = initialSelectedPositions[noteId];
        if (initialPos) {
          const newX = initialPos.x + deltaX;
          const newY = initialPos.y + deltaY;

          updateNote(noteId, {
            x: newX,
            y: newY,
            isDragging: true,
            draggedBy: user.uid,
          });
        }
      });
    },
    [
      isDraggingMultiple,
      dragStartPos,
      selectedNoteIds,
      initialSelectedPositions,
      updateNote,
      user.uid,
    ]
  );

  // 一括移動の終了
  const handleBulkDragEnd = useCallback(() => {
    if (isDraggingMultiple) {
      // 最終位置を確定
      selectedNoteIds.forEach((noteId) => {
        updateNote(noteId, {
          isDragging: false,
          draggedBy: null,
        });
      });

      setJustFinishedBulkDrag(true);

      // 一括ドラッグ状態を遅延してクリア（クリックイベントを防ぐため）
      setTimeout(() => {
        setIsDraggingMultiple(false);
        setDragStartPos(null);
        setInitialSelectedPositions({});
      }, 100);

      // さらに後にフラグをクリア
      setTimeout(() => {
        setJustFinishedBulkDrag(false);
      }, 300);
    }
  }, [isDraggingMultiple, selectedNoteIds, updateNote]);

  // マウスイベントのリスナー設定
  useEffect(() => {
    if (isSelecting) {
      document.addEventListener("mousemove", handleBoardMouseMove);
      document.addEventListener("mouseup", handleBoardMouseUp);
      return () => {
        document.removeEventListener("mousemove", handleBoardMouseMove);
        document.removeEventListener("mouseup", handleBoardMouseUp);
      };
    }
  }, [isSelecting, handleBoardMouseMove, handleBoardMouseUp]);

  useEffect(() => {
    if (isDraggingMultiple) {
      document.addEventListener("mousemove", handleBulkDragMove);
      document.addEventListener("mouseup", handleBulkDragEnd);
      return () => {
        document.removeEventListener("mousemove", handleBulkDragMove);
        document.removeEventListener("mouseup", handleBulkDragEnd);
      };
    }
  }, [isDraggingMultiple, handleBulkDragMove, handleBulkDragEnd]);

  const copyNote = (noteId: string) => {
    const note = notes.find((n) => n.id === noteId);
    if (note) {
      setCopiedNote(note);
    }
  };

  // 付箋を画像としてクリップボードにコピー
  const copyNotesAsImage = async () => {
    if (selectedNoteIds.size === 0) {
      return;
    }

    try {
      const noteIds = Array.from(selectedNoteIds);
      let success = false;

      if (noteIds.length === 1) {
        success = await copyStickyNoteToClipboard(noteIds[0]);
      } else {
        success = await copyMultipleStickyNotesToClipboard(noteIds);
      }
    } catch (error) {
      // Silent fail
    }
  };

  // 複数選択された付箋を削除
  const deleteSelectedNotes = () => {
    selectedNoteIds.forEach((noteId) => {
      const note = notes.find((n) => n.id === noteId);
      if (note && note.userId === user.uid) {
        deleteNote(noteId);
      }
    });
    setSelectedNoteIds(new Set());
    setActiveNoteId(null);
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

      // Add to history for undo functionality
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
        } else if (e.key === "c" && selectedNoteIds.size > 0) {
          // Check if a textarea (note editor) is focused
          const activeElement = document.activeElement;
          const isTextareaFocused =
            activeElement && activeElement.tagName === "TEXTAREA";

          // Only copy as image if no textarea is focused
          if (!isTextareaFocused) {
            // Ctrl+C: Copy selected notes as image
            e.preventDefault();
            copyNotesAsImage();
          }
          // If textarea is focused, let the default copy behavior happen
        } else if (e.key === "c" && activeNoteId) {
          e.preventDefault();
          copyNote(activeNoteId);
        } else if (e.key === "v" && copiedNote) {
          // Check if a textarea (note editor) is focused
          const activeElement = document.activeElement;
          const isTextareaFocused =
            activeElement && activeElement.tagName === "TEXTAREA";

          // Only paste note if no textarea is focused
          if (!isTextareaFocused) {
            e.preventDefault();
            pasteNote();
          }
          // If textarea is focused, let the default paste behavior happen
        } else if (e.key === "a") {
          // テキストエリアにフォーカスがある場合は通常のテキスト選択を許可
          const activeElement = document.activeElement;
          const isTextareaFocused =
            activeElement && activeElement.tagName === "TEXTAREA";

          if (!isTextareaFocused) {
            e.preventDefault();
            // Select all notes
            const allNoteIds = new Set(notes.map((note) => note.id));
            setSelectedNoteIds(allNoteIds);
            if (notes.length > 0) {
              setActiveNoteId(notes[notes.length - 1].id);
            }
          }
        }
      } else if (
        (e.key === "Delete" || e.key === "Backspace") &&
        selectedNoteIds.size > 0
      ) {
        // Delete selected notes if no textarea is focused
        const activeElement = document.activeElement;
        const isTextareaFocused =
          activeElement && activeElement.tagName === "TEXTAREA";

        if (!isTextareaFocused) {
          e.preventDefault();
          deleteSelectedNotes();
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
    selectedNoteIds,
    notes,
    deleteSelectedNotes,
  ]);

  // Show loading state while checking access
  if (isCheckingAccess) {
    return <div className="loading"></div>;
  }

  // 選択範囲の描画
  const renderSelectionBox = () => {
    if (!isSelecting || !selectionStart || !selectionEnd) return null;

    const minX = Math.min(selectionStart.x, selectionEnd.x);
    const minY = Math.min(selectionStart.y, selectionEnd.y);
    const width = Math.abs(selectionEnd.x - selectionStart.x);
    const height = Math.abs(selectionEnd.y - selectionStart.y);

    return (
      <div
        className="selection-box"
        style={{
          position: "absolute",
          left: `${minX}px`,
          top: `${minY}px`,
          width: `${width}px`,
          height: `${height}px`,
          border: "2px dashed #5b97ff",
          backgroundColor: "rgba(91, 151, 255, 0.1)",
          pointerEvents: "none",
          zIndex: 9999,
        }}
      />
    );
  };

  return (
    <div
      className="board"
      onClick={handleBoardClick}
      onMouseDown={handleBoardMouseDown}
    >
      <div className="notes-container">
        {notes.map((note) => (
          <StickyNote
            key={note.id}
            note={note}
            onUpdate={updateNote}
            onDelete={deleteNote}
            isActive={activeNoteId === note.id}
            isSelected={selectedNoteIds.has(note.id)}
            onActivate={handleActivateNote}
            onStartBulkDrag={startBulkDrag}
            currentUserId={user.uid}
            getUserColor={getUserColor}
            isDraggingMultiple={isDraggingMultiple}
          />
        ))}

        <CursorDisplay cursors={cursors} />
        {renderSelectionBox()}
      </div>
      <button onClick={addNote} className="fab-add-btn">
        <LuPlus />
      </button>
    </div>
  );
}
