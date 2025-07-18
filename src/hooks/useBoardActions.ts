import { useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { rtdb } from "../config/firebase";
import { ref, set, remove, update } from "firebase/database";
import { User, Note, Board, Project } from "../types";
import { useHistory } from "./useHistory";
import { checkBoardEditPermission } from "../utils/permissions";
import { generateNewBoardName } from "../utils/boardNaming";
import { syncBoardToAlgoliaAsync } from "../utils/algoliaSync";

interface UseBoardActionsProps {
  user: User | null;
  boardId: string | undefined;
  board: Board | null;
  project: Project | null;
  notes: Note[];
  nanoid: () => string;
  nextZIndex: number;
  setNextZIndex: (value: number | ((prev: number) => number)) => void;
  selectedNoteIds: Set<string>;
  setSelectedNoteIds: (
    value: Set<string> | ((prev: Set<string>) => Set<string>)
  ) => void;
  copiedNote: Note | null;
  setCopiedNote: (note: Note | null) => void;
  copiedNotes: Note[];
  setCopiedNotes: (notes: Note[]) => void;
  isUndoRedoOperation: boolean;
  currentUndoRedoNoteId: string | null;
  panX: number;
  panY: number;
  zoom: number;
}

export function useBoardActions({
  user,
  boardId,
  board,
  project,
  notes,
  nanoid,
  nextZIndex,
  setNextZIndex,
  selectedNoteIds,
  setSelectedNoteIds,
  copiedNote,
  setCopiedNote,
  copiedNotes,
  setCopiedNotes,
  isUndoRedoOperation,
  currentUndoRedoNoteId,
  panX,
  panY,
  zoom,
}: UseBoardActionsProps) {
  const navigate = useNavigate();
  const { addToHistory } = useHistory();

  // ボードの更新時刻を更新する関数
  const updateBoardTimestamp = useCallback(() => {
    if (!boardId || !user?.uid) return;
    try {
      const boardRef = ref(rtdb, `boards/${boardId}`);
      const updateData = { updatedAt: Date.now() };
      update(boardRef, updateData);
    } catch (error) {
      console.error("Error updating board timestamp:", error);
    }
  }, [boardId, user?.uid]);

  // Algolia同期をトリガーする関数（非同期で実行）
  const syncToAlgolia = useCallback(() => {
    if (!boardId || !board) return;
    // 非同期でAlgolia同期を実行（UIをブロックしない）
    syncBoardToAlgoliaAsync(boardId, board);
  }, [boardId, board]);

  // 付箋を追加
  const addNote = useCallback(
    (x?: number, y?: number): string => {
      if (!user?.uid) return "";

      if (
        !board ||
        !checkBoardEditPermission(board, project, user.uid).canEdit
      ) {
        return "";
      }

      let noteX: number;
      let noteY: number;

      if (x !== undefined && y !== undefined) {
        noteX = x;
        noteY = y;
      } else {
        const viewportCenterX = -panX / zoom + window.innerWidth / 2 / zoom;
        const viewportCenterY = -panY / zoom + window.innerHeight / 2 / zoom;
        noteX = viewportCenterX + (Math.random() - 0.5) * 300;
        noteY = viewportCenterY + (Math.random() - 0.5) * 300;
      }

      const newNote: Omit<Note, "id"> = {
        content: "",
        x: noteX,
        y: noteY,
        color: "white",
        textSize: "medium",
        userId: user.uid,
        createdAt: Date.now(),
        zIndex: nextZIndex,
        width: "auto",
        isDragging: false,
        draggedBy: null,
      };

      const noteId = nanoid();

      if (!isUndoRedoOperation) {
        addToHistory({
          type: "CREATE_NOTES",
          noteId: noteId,
          notes: [{ ...newNote, id: noteId }],
          userId: user.uid,
        });
      }

      const noteRef = ref(rtdb, `boards/${boardId}/notes/${noteId}`);
      set(noteRef, newNote);
      setNextZIndex((prev) => prev + 1);

      setTimeout(() => {
        try {
          updateBoardTimestamp();
          syncToAlgolia();
        } catch (error) {
          console.error(
            "Error updating board timestamp after adding note:",
            error
          );
        }
      }, 100);

      return noteId;
    },
    [
      user?.uid,
      board,
      project,
      boardId,
      nextZIndex,
      updateBoardTimestamp,
      syncToAlgolia,
      addToHistory,
      isUndoRedoOperation,
      nanoid,
      panX,
      panY,
      zoom,
      setNextZIndex,
    ]
  );

  // 付箋を更新
  const updateNote = useCallback(
    (noteId: string, updates: Partial<Note>) => {
      if (!user?.uid) return;

      const noteRef = ref(rtdb, `boards/${boardId}/notes/${noteId}`);
      const note = notes.find((n) => n.id === noteId);
      if (note) {
        const updatedNote = { ...note, ...updates };

        if (
          !isUndoRedoOperation &&
          note.userId === user.uid &&
          currentUndoRedoNoteId !== noteId
        ) {
          if (
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

        if (updates.content !== undefined) {
          setTimeout(() => {
            try {
              updateBoardTimestamp();
              syncToAlgolia();
            } catch (error) {
              console.error(
                "Error updating board timestamp after updating note:",
                error
              );
            }
          }, 100);
        }
      }
    },
    [
      user?.uid,
      boardId,
      notes,
      addToHistory,
      updateBoardTimestamp,
      syncToAlgolia,
      currentUndoRedoNoteId,
      isUndoRedoOperation,
    ]
  );

  // 付箋を削除
  const deleteNote = useCallback(
    (noteId: string) => {
      if (!user?.uid) return;

      const note = notes.find((n) => n.id === noteId);

      if (!isUndoRedoOperation && note && note.userId === user.uid) {
        addToHistory({
          type: "DELETE_NOTES",
          noteId: noteId,
          notes: [note],
          userId: user.uid,
        });
      }

      const noteRef = ref(rtdb, `boards/${boardId}/notes/${noteId}`);
      remove(noteRef);

      setTimeout(() => {
        try {
          updateBoardTimestamp();
          syncToAlgolia();
        } catch (error) {
          console.error(
            "Error updating board timestamp after deleting note:",
            error
          );
        }
      }, 100);

      if (selectedNoteIds.has(noteId)) {
        setSelectedNoteIds((prev) => {
          const newSet = new Set(prev);
          newSet.delete(noteId);
          return newSet;
        });
      }
    },
    [
      user?.uid,
      notes,
      boardId,
      updateBoardTimestamp,
      syncToAlgolia,
      selectedNoteIds,
      addToHistory,
      isUndoRedoOperation,
      setSelectedNoteIds,
    ]
  );

  // 選択した付箋を削除
  const deleteSelectedNotes = useCallback(() => {
    if (!user?.uid || selectedNoteIds.size === 0) return;

    const selectedNotes = notes.filter((note) => selectedNoteIds.has(note.id));
    const userNotes = selectedNotes.filter((note) => note.userId === user.uid);

    if (userNotes.length === 0) return;

    if (!isUndoRedoOperation) {
      addToHistory({
        type: "DELETE_NOTES",
        noteId: userNotes[0].id,
        notes: userNotes,
        userId: user.uid,
      });
    }

    userNotes.forEach((note) => {
      const noteRef = ref(rtdb, `boards/${boardId}/notes/${note.id}`);
      remove(noteRef);
    });

    setSelectedNoteIds(new Set());

    setTimeout(() => {
      try {
        updateBoardTimestamp();
        syncToAlgolia();
      } catch (error) {
        console.error(
          "Error updating board timestamp after deleting notes:",
          error
        );
      }
    }, 100);
  }, [
    user?.uid,
    selectedNoteIds,
    notes,
    boardId,
    updateBoardTimestamp,
    syncToAlgolia,
    addToHistory,
    isUndoRedoOperation,
    setSelectedNoteIds,
  ]);

  // 付箋をコピー
  const copyNotesAsData = useCallback(() => {
    if (selectedNoteIds.size === 0) return;

    const selectedNotes = notes.filter((note) => selectedNoteIds.has(note.id));
    if (selectedNotes.length === 1) {
      setCopiedNote(selectedNotes[0]);
      setCopiedNotes([]);
    } else {
      setCopiedNotes(selectedNotes);
      setCopiedNote(null);
    }
  }, [selectedNoteIds, notes, setCopiedNote, setCopiedNotes]);

  // 付箋を貼り付け
  const pasteCopiedNotes = useCallback(() => {
    if (!user?.uid) return;

    const notesToPaste =
      copiedNotes.length > 0 ? copiedNotes : copiedNote ? [copiedNote] : [];
    if (notesToPaste.length === 0) return;

    const viewportCenterX = -panX / zoom + window.innerWidth / 2 / zoom;
    const viewportCenterY = -panY / zoom + window.innerHeight / 2 / zoom;

    const createdNotes: Note[] = [];
    notesToPaste.forEach((note, index) => {
      const noteId = nanoid();
      const newNote: Note = {
        ...note,
        id: noteId,
        x: viewportCenterX + index * 20,
        y: viewportCenterY + index * 20,
        userId: user.uid,
        createdAt: Date.now(),
        zIndex: nextZIndex + index,
      };

      createdNotes.push(newNote);
      const noteRef = ref(rtdb, `boards/${boardId}/notes/${noteId}`);
      set(noteRef, newNote);
    });

    if (!isUndoRedoOperation) {
      addToHistory({
        type: "CREATE_NOTES",
        noteId: createdNotes[0].id,
        notes: createdNotes,
        userId: user.uid,
      });
    }

    setNextZIndex((prev) => prev + notesToPaste.length);
    const newNoteIds = new Set(createdNotes.map((note) => note.id));
    setSelectedNoteIds(newNoteIds);

    setTimeout(() => {
      try {
        updateBoardTimestamp();
      } catch (error) {
        console.error(
          "Error updating board timestamp after pasting notes:",
          error
        );
      }
    }, 100);
  }, [
    user?.uid,
    copiedNotes,
    copiedNote,
    panX,
    panY,
    zoom,
    nanoid,
    nextZIndex,
    boardId,
    addToHistory,
    isUndoRedoOperation,
    setNextZIndex,
    setSelectedNoteIds,
    updateBoardTimestamp,
  ]);

  // 新しいボードを作成
  const createBoardFromSelection = useCallback(async () => {
    if (!user?.uid || selectedNoteIds.size === 0) return;

    const selectedNotes = notes.filter((note) => selectedNoteIds.has(note.id));
    if (selectedNotes.length === 0) return;

    const newBoardId = nanoid();
    const newBoardName = await generateNewBoardName(board?.projectId || "");

    const newBoard = {
      name: newBoardName,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      userId: user.uid,
      isPublic: false,
    };

    const boardRef = ref(rtdb, `boards/${newBoardId}`);
    await set(boardRef, newBoard);

    selectedNotes.forEach((note, index) => {
      const newNoteId = nanoid();
      const newNote = {
        ...note,
        id: newNoteId,
        x: note.x - Math.min(...selectedNotes.map((n) => n.x)) + 100,
        y: note.y - Math.min(...selectedNotes.map((n) => n.y)) + 100,
        userId: user.uid,
        createdAt: Date.now(),
        zIndex: index + 1,
      };

      const noteRef = ref(rtdb, `boards/${newBoardId}/notes/${newNoteId}`);
      set(noteRef, newNote);
    });

    navigate(`/board/${newBoardId}`);
  }, [user?.uid, selectedNoteIds, notes, nanoid, navigate]);

  return {
    addNote,
    updateNote,
    deleteNote,
    deleteSelectedNotes,
    copyNotesAsData,
    pasteCopiedNotes,
    createBoardFromSelection,
    updateBoardTimestamp,
  };
}
