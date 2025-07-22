import React, { useCallback, useEffect } from "react";
import { Note } from "../types";
import { useInertialZoom } from "./useInertialZoom";
import { usePerformanceDetection } from "./usePerformanceDetection";

interface UseBoardEventHandlersProps {
  // 状態
  selectedNoteIds: Set<string>;
  setSelectedNoteIds: (value: Set<string> | ((prev: Set<string>) => Set<string>)) => void;
  isSelecting: boolean;
  setIsSelecting: (value: boolean) => void;
  selectionStart: { x: number; y: number } | null;
  setSelectionStart: (value: { x: number; y: number } | null) => void;
  selectionEnd: { x: number; y: number } | null;
  setSelectionEnd: (value: { x: number; y: number } | null) => void;
  isDraggingMultiple: boolean;
  justFinishedBulkDrag: boolean;
  justFinishedSelection: boolean;
  setJustFinishedSelection: (value: boolean) => void;
  panX: number;
  setPanX: (value: number) => void;
  panY: number;
  setPanY: (value: number) => void;
  zoom: number;
  setZoom: (value: number) => void;
  isPanning: boolean;
  setIsPanning: (value: boolean) => void;
  panStartPos: { x: number; y: number } | null;
  setPanStartPos: (value: { x: number; y: number } | null) => void;
  initialPan: { x: number; y: number } | null;
  setInitialPan: (value: { x: number; y: number } | null) => void;
  
  // データ
  notes: Note[];
  
  // アクション
  addNote: (x?: number, y?: number) => string;
  deleteSelectedNotes: () => void;
  copyNotesAsData: () => void;
  pasteCopiedNotes: () => void;
  updateNote: (noteId: string, updates: Partial<Note>) => void;
  nextZIndex: number;
  setNextZIndex: (value: number | ((prev: number) => number)) => void;
  
  // 複数選択とドラッグ
  setIsMultiSelectMode: (value: boolean) => void;
}

export function useBoardEventHandlers({
  selectedNoteIds,
  setSelectedNoteIds,
  isSelecting,
  setIsSelecting,
  selectionStart,
  setSelectionStart,
  selectionEnd: _selectionEnd,
  setSelectionEnd,
  isDraggingMultiple,
  justFinishedBulkDrag,
  justFinishedSelection,
  setJustFinishedSelection,
  panX,
  setPanX,
  panY,
  setPanY,
  zoom,
  setZoom,
  isPanning,
  setIsPanning,
  panStartPos,
  setPanStartPos,
  initialPan,
  setInitialPan,
  notes,
  addNote,
  deleteSelectedNotes,
  copyNotesAsData,
  pasteCopiedNotes,
  updateNote,
  nextZIndex,
  setNextZIndex,
  setIsMultiSelectMode,
}: UseBoardEventHandlersProps) {

  // パフォーマンス検出
  const performance = usePerformanceDetection();
  
  // 性能に基づいて慣性ズーム設定を決定
  const getInertialZoomConfig = () => {
    if (performance.isHighPerformance) {
      return {
        enableInertia: true,
        inertiaFactor: 0.92,
        minZoomStep: 0.001,
        frameSkip: 0, // フレーム間引きなし
      };
    } else if (performance.isMediumPerformance) {
      return {
        enableInertia: true,
        inertiaFactor: 0.88,
        minZoomStep: 0.005,
        frameSkip: 1, // 1フレームおきに処理
      };
    } else {
      return {
        enableInertia: false, // 低性能環境では慣性無効
        inertiaFactor: 0.8,
        minZoomStep: 0.01,
        frameSkip: 2, // 2フレームおきに処理
      };
    }
  };

  // 慣性ズーム
  const { handleWheel: handleInertialWheel } = useInertialZoom({
    zoom,
    setZoom,
    panX,
    setPanX,
    panY,
    setPanY,
    config: getInertialZoomConfig(),
  });

  // ボードクリック
  const handleBoardClick = useCallback(() => {
    if (isSelecting || justFinishedSelection || justFinishedBulkDrag) {
      return;
    }
    setSelectedNoteIds(new Set());
  }, [isSelecting, justFinishedSelection, justFinishedBulkDrag, setSelectedNoteIds]);

  // ボードダブルクリック
  const handleBoardDoubleClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    if (target.closest(".sticky-note") || target.closest("button")) {
      return;
    }

    if (isDraggingMultiple) {
      return;
    }

    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left - panX) / zoom;
    const y = (e.clientY - rect.top - panY) / zoom;

    const noteId = addNote(x, y);
    if (noteId) {
      setSelectedNoteIds(new Set([noteId]));
    }
  }, [isDraggingMultiple, panX, panY, zoom, addNote, setSelectedNoteIds]);

  // ノートのアクティベート
  const handleActivateNote = useCallback((noteId: string, isMultiSelect: boolean = false) => {
    if (isDraggingMultiple || justFinishedBulkDrag || justFinishedSelection) {
      return;
    }

    if (isMultiSelect) {
      const newSelectedIds = new Set(selectedNoteIds);
      if (newSelectedIds.has(noteId)) {
        newSelectedIds.delete(noteId);
      } else {
        newSelectedIds.add(noteId);
      }
      setSelectedNoteIds(newSelectedIds);
    } else {
      setSelectedNoteIds(new Set([noteId]));
    }

    const note = notes.find((n) => n.id === noteId);
    if (note) {
      updateNote(noteId, { zIndex: nextZIndex });
      setNextZIndex((prev) => prev + 1);
    }
  }, [
    isDraggingMultiple,
    justFinishedBulkDrag,
    justFinishedSelection,
    selectedNoteIds,
    notes,
    updateNote,
    nextZIndex,
    setSelectedNoteIds,
    setNextZIndex,
  ]);

  // マウスダウン
  const handleBoardMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left - panX) / zoom;
    const y = (e.clientY - rect.top - panY) / zoom;

    if (e.shiftKey) {
      setIsSelecting(true);
      setSelectionStart({ x, y });
      setSelectionEnd({ x, y });
      setIsMultiSelectMode(true);
    } else {
      setIsPanning(true);
      setPanStartPos({ x: e.clientX, y: e.clientY });
      setInitialPan({ x: panX, y: panY });
    }
  }, [
    panX,
    panY,
    zoom,
    setIsSelecting,
    setSelectionStart,
    setSelectionEnd,
    setIsMultiSelectMode,
    setIsPanning,
    setPanStartPos,
    setInitialPan,
  ]);

  // マウス移動
  const handleBoardMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (isSelecting && selectionStart) {
      const rect = e.currentTarget.getBoundingClientRect();
      const x = (e.clientX - rect.left - panX) / zoom;
      const y = (e.clientY - rect.top - panY) / zoom;
      setSelectionEnd({ x, y });

      const left = Math.min(selectionStart.x, x);
      const right = Math.max(selectionStart.x, x);
      const top = Math.min(selectionStart.y, y);
      const bottom = Math.max(selectionStart.y, y);

      const notesInSelection = notes.filter(
        (note) =>
          note.x >= left && note.x <= right && note.y >= top && note.y <= bottom
      );

      setSelectedNoteIds(new Set(notesInSelection.map((note) => note.id)));
    } else if (isPanning && panStartPos && initialPan) {
      const deltaX = e.clientX - panStartPos.x;
      const deltaY = e.clientY - panStartPos.y;
      setPanX(initialPan.x + deltaX);
      setPanY(initialPan.y + deltaY);
    }
  }, [
    isSelecting,
    selectionStart,
    panX,
    panY,
    zoom,
    isPanning,
    panStartPos,
    initialPan,
    notes,
    setSelectionEnd,
    setSelectedNoteIds,
    setPanX,
    setPanY,
  ]);

  // マウスアップ
  const handleBoardMouseUp = useCallback(() => {
    if (isSelecting) {
      setIsSelecting(false);
      setSelectionStart(null);
      setSelectionEnd(null);
      setJustFinishedSelection(true);
      setTimeout(() => setJustFinishedSelection(false), 100);
    }

    if (isPanning) {
      setIsPanning(false);
      setPanStartPos(null);
      setInitialPan(null);
    }
  }, [
    isSelecting,
    isPanning,
    setIsSelecting,
    setSelectionStart,
    setSelectionEnd,
    setJustFinishedSelection,
    setIsPanning,
    setPanStartPos,
    setInitialPan,
  ]);

  // ホイールイベント（慣性ズーム対応）
  const handleWheel = handleInertialWheel;

  // キーボードショートカット（Board.tsxの統合ハンドラーに移行したため無効化）
  // useEffect(() => {
  //   const handleKeyDown = (e: KeyboardEvent) => {
  //     if (e.ctrlKey || e.metaKey) {
  //       switch (e.key) {
  //         case "c":
  //           if (selectedNoteIds.size > 0) {
  //             e.preventDefault();
  //             copyNotesAsData();
  //           }
  //           break;
  //         case "v":
  //           e.preventDefault();
  //           pasteCopiedNotes();
  //           break;
  //         case "a":
  //           if (!document.activeElement || 
  //               (document.activeElement.tagName !== "TEXTAREA" && 
  //                document.activeElement.tagName !== "INPUT")) {
  //             e.preventDefault();
  //             setSelectedNoteIds(new Set(notes.map((note) => note.id)));
  //           }
  //           break;
  //       }
  //     } else if (e.key === "Delete" || e.key === "Backspace") {
  //       if (selectedNoteIds.size > 0 && 
  //           (!document.activeElement || 
  //            (document.activeElement.tagName !== "TEXTAREA" && 
  //             document.activeElement.tagName !== "INPUT"))) {
  //         e.preventDefault();
  //         deleteSelectedNotes();
  //       }
  //     } else if (e.key === "Escape") {
  //       setSelectedNoteIds(new Set());
  //     }
  //   };

  //   document.addEventListener("keydown", handleKeyDown);
  //   return () => {
  //     document.removeEventListener("keydown", handleKeyDown);
  //   };
  // }, [
  //   selectedNoteIds,
  //   notes,
  //   copyNotesAsData,
  //   pasteCopiedNotes,
  //   deleteSelectedNotes,
  //   setSelectedNoteIds,
  // ]);

  return {
    handleBoardClick,
    handleBoardDoubleClick,
    handleActivateNote,
    handleBoardMouseDown,
    handleBoardMouseMove,
    handleBoardMouseUp,
    handleWheel,
  };
}