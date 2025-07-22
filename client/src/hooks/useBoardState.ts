import { useState, useRef } from "react";
import { customAlphabet } from "nanoid";
import { Note } from "../types";

export function useBoardState() {
  // 選択とアクティブ状態
  const [selectedNoteIds, setSelectedNoteIds] = useState<Set<string>>(new Set());
  const [nextZIndex, setNextZIndex] = useState<number>(100);
  const [copiedNote, setCopiedNote] = useState<Note | null>(null);
  const [copiedNotes, setCopiedNotes] = useState<Note[]>([]);
  const [sessionId] = useState<string>(() =>
    Math.random().toString(36).substr(2, 9)
  );
  const [isUndoRedoOperation, setIsUndoRedoOperation] = useState<boolean>(false);
  const [currentUndoRedoNoteId, setCurrentUndoRedoNoteId] = useState<string | null>(null);
  const [noteToFocus, setNoteToFocus] = useState<string | null>(null);

  // 範囲選択用の状態
  const [isSelecting, setIsSelecting] = useState<boolean>(false);
  const [selectionStart, setSelectionStart] = useState<{ x: number; y: number } | null>(null);
  const [selectionEnd, setSelectionEnd] = useState<{ x: number; y: number } | null>(null);
  const [isMultiSelectMode, setIsMultiSelectMode] = useState<boolean>(false);
  const [justFinishedSelection, setJustFinishedSelection] = useState<boolean>(false);

  // 一括移動用の状態
  const [isDraggingMultiple, setIsDraggingMultiple] = useState<boolean>(false);
  const [dragStartPos, setDragStartPos] = useState<{ x: number; y: number } | null>(null);
  const [initialSelectedPositions, setInitialSelectedPositions] = useState<Record<string, { x: number; y: number }>>({});
  const [justFinishedBulkDrag, setJustFinishedBulkDrag] = useState<boolean>(false);

  // パン・ズーム用の状態
  const [panX, setPanX] = useState<number>(0);
  const [panY, setPanY] = useState<number>(0);
  const [zoom, setZoom] = useState<number>(1);
  const [isPanning, setIsPanning] = useState<boolean>(false);
  const [panStartPos, setPanStartPos] = useState<{ x: number; y: number } | null>(null);
  const [initialPan, setInitialPan] = useState<{ x: number; y: number } | null>(null);

  // ズーム慣性用の状態
  const [zoomVelocity, setZoomVelocity] = useState<number>(0);
  const [lastWheelTime, setLastWheelTime] = useState<number>(0);
  const zoomAnimationRef = useRef<number | null>(null);
  const [zoomTarget, setZoomTarget] = useState<{ x: number; y: number } | null>(null);

  // 新しいボード作成の状態
  const [isCreatingBoard, setIsCreatingBoard] = useState<boolean>(false);

  // Refs
  const boardRef = useRef<HTMLDivElement>(null);
  const notesContainerRef = useRef<HTMLDivElement>(null);

  // nanoid generator
  const nanoid = customAlphabet(
    "abcdefghijklmnopqrstuvwxyz0123456789",
    21
  );

  return {
    // 選択とアクティブ状態
    selectedNoteIds,
    setSelectedNoteIds,
    nextZIndex,
    setNextZIndex,
    copiedNote,
    setCopiedNote,
    copiedNotes,
    setCopiedNotes,
    sessionId,
    isUndoRedoOperation,
    setIsUndoRedoOperation,
    currentUndoRedoNoteId,
    setCurrentUndoRedoNoteId,
    noteToFocus,
    setNoteToFocus,

    // 範囲選択用の状態
    isSelecting,
    setIsSelecting,
    selectionStart,
    setSelectionStart,
    selectionEnd,
    setSelectionEnd,
    isMultiSelectMode,
    setIsMultiSelectMode,
    justFinishedSelection,
    setJustFinishedSelection,

    // 一括移動用の状態
    isDraggingMultiple,
    setIsDraggingMultiple,
    dragStartPos,
    setDragStartPos,
    initialSelectedPositions,
    setInitialSelectedPositions,
    justFinishedBulkDrag,
    setJustFinishedBulkDrag,

    // パン・ズーム用の状態
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

    // ズーム慣性用の状態
    zoomVelocity,
    setZoomVelocity,
    lastWheelTime,
    setLastWheelTime,
    zoomAnimationRef,
    zoomTarget,
    setZoomTarget,

    // 新しいボード作成の状態
    isCreatingBoard,
    setIsCreatingBoard,

    // Refs
    boardRef,
    notesContainerRef,

    // nanoid generator
    nanoid,
  };
}