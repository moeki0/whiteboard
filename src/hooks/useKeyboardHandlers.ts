import React, { useCallback } from "react";
import { Note } from "../types";

interface KeyboardHandlerProps {
  notes: Note[];
  selectedNoteIds: Set<string>;
  selectedItemIds: Set<string>;
  selectedGroupIds: Set<string>;
  isKeyHintMode: boolean;
  setIsKeyHintMode: React.Dispatch<React.SetStateAction<boolean>>;
  pressedKeyHistory: string[];
  setPressedKeyHistory: React.Dispatch<React.SetStateAction<string[]>>;
  noteHintKeys: Map<string, string>;
  panX: number;
  setPanX: React.Dispatch<React.SetStateAction<number>>;
  panY: number;
  setPanY: React.Dispatch<React.SetStateAction<number>>;
  zoom: number;
  setZoom: React.Dispatch<React.SetStateAction<number>>;
  onUndo: () => void;
  onRedo: () => void;
  onCopy: () => void;
  onPaste: () => void;
  onSelectAll: () => void;
  onAddNote: (x?: number, y?: number) => void;
  onAddNoteWithFocus: () => void;
  onCreateGroup: () => void;
  onDelete: () => void;
  generateHintKeys: (noteIds: string[]) => void;
  setNoteToFocus: React.Dispatch<React.SetStateAction<string | null>>;
  setSelectedNoteIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  onAddArrow?: () => void; // 矢印追加関数（オプション）
}

export function useKeyboardHandlers({
  notes,
  selectedNoteIds,
  selectedItemIds,
  selectedGroupIds,
  isKeyHintMode,
  setIsKeyHintMode,
  pressedKeyHistory,
  setPressedKeyHistory,
  noteHintKeys,
  panX,
  setPanX,
  panY,
  setPanY,
  zoom,
  setZoom,
  onUndo,
  onRedo,
  onCopy,
  onPaste,
  onSelectAll,
  onAddNote,
  onAddNoteWithFocus,
  onCreateGroup,
  onDelete,
  generateHintKeys,
  setNoteToFocus,
  setSelectedNoteIds,
  onAddArrow,
}: KeyboardHandlerProps) {
  const handleUndoKey = useCallback(
    (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "z" && !e.shiftKey) {
        console.log("Undo key detected");
        e.preventDefault();
        onUndo();
      }
    },
    [onUndo]
  );

  const handleRedoKey = useCallback(
    (e: KeyboardEvent) => {
      if (
        (e.ctrlKey || e.metaKey) &&
        ((e.key === "z" && e.shiftKey) || e.key === "y")
      ) {
        console.log("Redo key detected");
        e.preventDefault();
        onRedo();
      }
    },
    [onRedo]
  );

  const handleCopyKey = useCallback(
    async (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "c") {
        e.preventDefault();
        onCopy();
      }
    },
    [onCopy]
  );

  const handlePasteKey = useCallback(
    async (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "v") {
        e.preventDefault();
        onPaste();
      }
    },
    [onPaste]
  );

  const handleSelectAllKey = useCallback(
    (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "a") {
        e.preventDefault();
        onSelectAll();
      }
    },
    [onSelectAll]
  );

  const handleNewNoteKey = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "n") {
        e.preventDefault();
        onAddNote();
      }
    },
    [onAddNote]
  );

  const handleNewNoteWithFocusKey = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "N") {
        e.preventDefault();
        onAddNoteWithFocus();
      }
    },
    [onAddNoteWithFocus]
  );

  const handleCreateGroupKey = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "g") {
        e.preventDefault();
        onCreateGroup();
      }
    },
    [onCreateGroup]
  );

  const handleKeyHintModeKey = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "f") {
        e.preventDefault();
        setIsKeyHintMode((prev) => {
          if (!prev) {
            const visibleNoteIds = notes.map((note) => note.id);
            generateHintKeys(visibleNoteIds);
          }
          return !prev;
        });
      }
    },
    [setIsKeyHintMode, notes, generateHintKeys]
  );

  const handleArrowKeys = useCallback(
    (e: KeyboardEvent) => {
      const panSpeed = 50 / zoom;

      switch (e.key) {
        case "ArrowLeft":
          e.preventDefault();
          setPanX((prev) => prev + panSpeed);
          break;
        case "ArrowRight":
          e.preventDefault();
          setPanX((prev) => prev - panSpeed);
          break;
        case "ArrowUp":
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            const zoomFactor = 1.1;
            const newZoom = Math.max(0.1, Math.min(5, zoom * zoomFactor));
            setZoom(newZoom);
          } else {
            e.preventDefault();
            setPanY((prev) => prev + panSpeed);
          }
          break;
        case "ArrowDown":
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            const zoomFactor = 0.9;
            const newZoom = Math.max(0.1, Math.min(5, zoom * zoomFactor));
            setZoom(newZoom);
          } else {
            e.preventDefault();
            setPanY((prev) => prev - panSpeed);
          }
          break;
      }
    },
    [zoom, setPanX, setPanY, setZoom]
  );

  const handleDeleteKey = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        onDelete();
      }
    },
    [onDelete]
  );

  const handleKeyHintModeProcessing = useCallback(
    (e: KeyboardEvent) => {
      if (!isKeyHintMode) return false;

      e.preventDefault();
      const newHistory = [...pressedKeyHistory, e.key];
      setPressedKeyHistory(newHistory);

      const currentSequence = newHistory.join("");
      const matchingEntry = Array.from(noteHintKeys.entries()).find(
        ([_, sequence]) => sequence === currentSequence
      );

      if (matchingEntry) {
        const [matchingNoteId] = matchingEntry;
        setNoteToFocus(matchingNoteId);
        setSelectedNoteIds(new Set([matchingNoteId]));
        setIsKeyHintMode(false);
        setPressedKeyHistory([]);
        return true;
      }

      const hasPartialMatch = Array.from(noteHintKeys.values()).some(
        (sequence) => sequence.startsWith(currentSequence)
      );

      if (!hasPartialMatch) {
        setIsKeyHintMode(false);
        setPressedKeyHistory([]);
      }

      return true;
    },
    [
      isKeyHintMode,
      pressedKeyHistory,
      setPressedKeyHistory,
      noteHintKeys,
      setIsKeyHintMode,
      setNoteToFocus,
      setSelectedNoteIds,
    ]
  );

  const handleWASDKeys = useCallback(
    (e: KeyboardEvent) => {
      // Shiftキーが押されている場合はWASD処理をスキップ
      if (e.shiftKey) return false;

      const panSpeed = 50 / zoom;

      switch (e.key.toLowerCase()) {
        case "w":
          e.preventDefault();
          setPanY((prev) => prev + panSpeed);
          return true;
        case "a":
          e.preventDefault();
          setPanX((prev) => prev + panSpeed);
          return true;
        case "s":
          e.preventDefault();
          setPanY((prev) => prev - panSpeed);
          return true;
        case "d":
          e.preventDefault();
          setPanX((prev) => prev - panSpeed);
          return true;
      }
      return false;
    },
    [zoom, setPanX, setPanY]
  );

  const handleEscapeKey = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();

        if (isKeyHintMode) {
          setIsKeyHintMode(false);
          setPressedKeyHistory([]);
        } else if (
          selectedNoteIds.size > 0 ||
          selectedItemIds.size > 0 ||
          selectedGroupIds.size > 0
        ) {
          setSelectedNoteIds(new Set());
        }
      }
    },
    [
      isKeyHintMode,
      setIsKeyHintMode,
      setPressedKeyHistory,
      selectedNoteIds,
      selectedItemIds,
      selectedGroupIds,
      setSelectedNoteIds,
    ]
  );

  const handleEnterKey = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Enter" && selectedNoteIds.size === 1) {
        e.preventDefault();
        const selectedNote = notes.find((note) => selectedNoteIds.has(note.id));
        if (selectedNote) {
          setNoteToFocus(selectedNote.id);
        }
      }
    },
    [selectedNoteIds, notes, setNoteToFocus]
  );

  const handleShiftKeys = useCallback(
    (e: KeyboardEvent) => {
      if (!e.shiftKey) return false;

      // デバッグログ
      console.log("Shift key detected:", e.key, e.code);

      // e.codeを使用してキーを判別
      switch (e.code) {
        case "KeyG":
          // Shift+G: グループを作成
          console.log("Shift+G detected");
          if (selectedNoteIds.size >= 2) {
            e.preventDefault();
            onCreateGroup();
            return true;
          }
          break;
        case "KeyS":
          // Shift+S: キーヒントモード (fキーと同じ機能)
          console.log("Shift+S detected, toggling key hint mode");
          console.log("Current isKeyHintMode:", isKeyHintMode);
          e.preventDefault();

          // 状態更新を直接実行して重複を防ぐ
          if (!isKeyHintMode) {
            console.log("Enabling key hint mode");
            const visibleNoteIds = notes.map((note) => note.id);
            console.log(
              "Generating hint keys for notes:",
              visibleNoteIds.length
            );
            generateHintKeys(visibleNoteIds);
            setIsKeyHintMode(true);
          } else {
            console.log("Disabling key hint mode");
            setIsKeyHintMode(false);
          }
          return true;
        case "KeyA":
          // Shift+A: 矢印を挿入
          console.log("Shift+A detected");
          if (onAddArrow) {
            e.preventDefault();
            onAddArrow();
            return true;
          }
          break;
        case "KeyC":
          // Shift+C: 新しい付箋を追加してフォーカス
          console.log("Shift+C detected");
          e.preventDefault();
          const newNoteId = onAddNote();
          if (typeof newNoteId === "string") {
            setNoteToFocus(newNoteId);
          }
          return true;
      }
      return false;
    },
    [
      selectedNoteIds,
      onCreateGroup,
      setIsKeyHintMode,
      notes,
      generateHintKeys,
      onAddArrow,
      onAddNote,
      setNoteToFocus,
    ]
  );

  return {
    handleUndoKey,
    handleRedoKey,
    handleCopyKey,
    handlePasteKey,
    handleSelectAllKey,
    handleNewNoteKey,
    handleNewNoteWithFocusKey,
    handleCreateGroupKey,
    handleKeyHintModeKey,
    handleArrowKeys,
    handleDeleteKey,
    handleKeyHintModeProcessing,
    handleWASDKeys,
    handleEscapeKey,
    handleEnterKey,
    handleShiftKeys,
  };
}
