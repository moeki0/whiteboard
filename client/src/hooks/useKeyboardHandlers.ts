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
  boardRef: React.RefObject<HTMLDivElement | null>; // ボード要素の参照を追加
  lastMousePos: React.MutableRefObject<{ x: number; y: number }>; // 最後のマウス位置を追加
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
  onMoveSelectedNotes?: (deltaX: number, deltaY: number) => void; // 付箋移動関数（オプション）
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
  boardRef,
  lastMousePos,
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
  onMoveSelectedNotes,
}: KeyboardHandlerProps) {
  const handleUndoKey = useCallback(
    (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "z" && !e.shiftKey) {
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
      if (e.shiftKey && e.code === "KeyS") {
        e.preventDefault();
        setIsKeyHintMode(true);
        generateHintKeys(notes.map((note) => note.id));
      }
    },
    [setIsKeyHintMode, notes, generateHintKeys]
  );

  const handleArrowKeys = useCallback(
    (e: KeyboardEvent) => {
      const panSpeed = 50 / zoom;
      const noteMoveDelta = 10; // 付箋移動の単位

      switch (e.key) {
        case "ArrowLeft":
          e.preventDefault();
          if (e.shiftKey) {
            // Shift+左矢印：左パン
            setPanX((prev) => prev + panSpeed);
          } else if (selectedNoteIds.size > 0 && onMoveSelectedNotes) {
            // 左矢印：選択中の付箋を左に移動
            onMoveSelectedNotes(-noteMoveDelta, 0);
          }
          break;
        case "ArrowRight":
          e.preventDefault();
          if (e.shiftKey) {
            // Shift+右矢印：右パン
            setPanX((prev) => prev - panSpeed);
          } else if (selectedNoteIds.size > 0 && onMoveSelectedNotes) {
            // 右矢印：選択中の付箋を右に移動
            onMoveSelectedNotes(noteMoveDelta, 0);
          }
          break;
        case "ArrowUp":
          e.preventDefault();
          if (e.shiftKey) {
            // Shift+上矢印：上パン
            setPanY((prev) => prev + panSpeed);
          } else if (selectedNoteIds.size > 0 && onMoveSelectedNotes) {
            // 上矢印：選択中の付箋を上に移動
            onMoveSelectedNotes(0, -noteMoveDelta);
          } else {
            // 付箋が選択されていない場合：ズームイン（画面中央を基準）
            if (boardRef.current) {
              // ビューポートのサイズを使用（実際に見えている画面のサイズ）
              const centerX = window.innerWidth / 2;
              const centerY = window.innerHeight / 2;

              const zoomFactor = 1.1;
              const newZoom = Math.max(0.1, Math.min(5, zoom * zoomFactor));

              // 画面中央のワールド座標を計算
              const worldCenterX = (centerX - panX) / zoom;
              const worldCenterY = (centerY - panY) / zoom;

              // ズーム後も画面中央が同じワールド座標を指すようにパンを調整
              const newPanX = centerX - worldCenterX * newZoom;
              const newPanY = centerY - worldCenterY * newZoom;

              setZoom(newZoom);
              setPanX(newPanX);
              setPanY(newPanY);
            }
          }
          break;
        case "ArrowDown":
          e.preventDefault();
          if (e.shiftKey) {
            // Shift+下矢印：下パン
            setPanY((prev) => prev - panSpeed);
          } else if (selectedNoteIds.size > 0 && onMoveSelectedNotes) {
            // 下矢印：選択中の付箋を下に移動
            onMoveSelectedNotes(0, noteMoveDelta);
          } else {
            // 付箋が選択されていない場合：ズームアウト（画面中央を基準）
            if (boardRef.current) {
              // ビューポートのサイズを使用（実際に見えている画面のサイズ）
              const centerX = window.innerWidth / 2;
              const centerY = window.innerHeight / 2;

              const zoomFactor = 0.9;
              const newZoom = Math.max(0.1, Math.min(5, zoom * zoomFactor));

              // 画面中央のワールド座標を計算
              const worldCenterX = (centerX - panX) / zoom;
              const worldCenterY = (centerY - panY) / zoom;

              // ズーム後も画面中央が同じワールド座標を指すようにパンを調整
              const newPanX = centerX - worldCenterX * newZoom;
              const newPanY = centerY - worldCenterY * newZoom;

              setZoom(newZoom);
              setPanX(newPanX);
              setPanY(newPanY);
            }
          }
          break;
      }
    },
    [
      zoom,
      setPanX,
      setPanY,
      setZoom,
      panX,
      panY,
      boardRef,
      selectedNoteIds,
      onMoveSelectedNotes,
    ]
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

      // e.codeを使用してキーを判別
      switch (e.code) {
        case "KeyG":
          // Shift+G: グループを作成または既存グループに追加

          // 2つ以上の付箋が選択されている、または
          // 1つのグループと1つ以上の付箋が選択されている場合
          if (
            selectedNoteIds.size >= 2 ||
            (selectedGroupIds.size === 1 && selectedNoteIds.size > 0)
          ) {
            e.preventDefault();
            onCreateGroup();
            return true;
          }
          break;
        case "KeyS":
          // Shift+S: キーヒントモードを開始

          e.preventDefault();
          setIsKeyHintMode(true);
          generateHintKeys(notes.map((note) => note.id));
          return true;
        case "KeyA":
          // Shift+A: 矢印を挿入

          if (onAddArrow) {
            e.preventDefault();
            onAddArrow();
            return true;
          }
          break;
        case "KeyC":
          // Shift+Cmd+C: コピー
          if (e.metaKey || e.ctrlKey) {
            e.preventDefault();
            onCopy();
            return true;
          }
          // Shift+C: 新しい付箋を追加してフォーカス

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
      selectedGroupIds,
      onCreateGroup,
      setIsKeyHintMode,
      notes,
      generateHintKeys,
      onAddArrow,
      onAddNote,
      setNoteToFocus,
      onCopy,
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
