import { useState, useEffect, useCallback, useRef } from "react";
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
import {
  copyStickyNoteToClipboard,
  copyMultipleStickyNotesToClipboard,
} from "../utils/clipboardUtils";
import {
  generateBoardThumbnail,
  saveBoardThumbnail,
} from "../utils/thumbnailUtils";
import { checkBoardEditPermission } from "../utils/permissions";
import { User, Note } from "../types";

interface BoardProps {
  user: User | null;
}

export function Board({ user }: BoardProps) {
  const navigate = useNavigate();
  // activeNoteIdを削除 - selectedNoteIdsで管理
  const [selectedNoteIds, setSelectedNoteIds] = useState<Set<string>>(
    new Set()
  );
  // selectedNoteIdsRefを削除 - 別のアプローチを使用
  const [nextZIndex, setNextZIndex] = useState<number>(100);
  const [copiedNote, setCopiedNote] = useState<Note | null>(null);
  const [copiedNotes, setCopiedNotes] = useState<Note[]>([]);
  const [sessionId] = useState<string>(() =>
    Math.random().toString(36).substr(2, 9)
  );
  const [isUndoRedoOperation, setIsUndoRedoOperation] =
    useState<boolean>(false);
  const [currentUndoRedoNoteId, setCurrentUndoRedoNoteId] = useState<
    string | null
  >(null);
  const [noteToFocus, setNoteToFocus] = useState<string | null>(null);

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

  // パン・ズーム用の状態
  const [panX, setPanX] = useState<number>(0);
  const [panY, setPanY] = useState<number>(0);
  const [zoom, setZoom] = useState<number>(1);
  const [isPanning, setIsPanning] = useState<boolean>(false);
  const [panStartPos, setPanStartPos] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const [initialPan, setInitialPan] = useState<{ x: number; y: number } | null>(
    null
  );
  
  // ズーム慣性用の状態
  const [zoomVelocity, setZoomVelocity] = useState<number>(0);
  const [lastWheelTime, setLastWheelTime] = useState<number>(0);
  const zoomAnimationRef = useRef<number | null>(null);
  const [zoomTarget, setZoomTarget] = useState<{ x: number; y: number } | null>(null);

  const boardRef = useRef<HTMLDivElement>(null);
  const notesContainerRef = useRef<HTMLDivElement>(null);

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
    board,
    project,
  } = useBoard(user, navigate, sessionId);

  const cursorColor = getUserColor(user?.uid || 'anonymous');

  // Use cursor tracking hook
  useCursor({
    boardId,
    user: user || { uid: 'anonymous', email: null, displayName: 'Anonymous', photoURL: null },
    sessionId,
    cursorColor,
  });

  // 初期位置を中央に設定
  useEffect(() => {
    if (boardRef.current) {
      const rect = boardRef.current.getBoundingClientRect();
      setPanX(rect.width / 2);
      setPanY(rect.height / 2);
    }
  }, []);

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

    const projectRef = ref(rtdb, `projects/${projectId}/members/${user?.uid || 'anonymous'}`);
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
  }, [projectId, user?.uid, boardId, navigate]);

  const addNote = (x?: number, y?: number): string => {
    // 権限チェック
    if (!board || !checkBoardEditPermission(board, project, user?.uid || null).canEdit) {
      return "";
    }

    let noteX: number;
    let noteY: number;

    if (x !== undefined && y !== undefined) {
      // 指定された座標を使用
      noteX = x;
      noteY = y;
    } else {
      // ビューポートの中央付近にランダムに配置
      const viewportCenterX = -panX / zoom + window.innerWidth / 2 / zoom;
      const viewportCenterY = -panY / zoom + window.innerHeight / 2 / zoom;
      noteX = viewportCenterX + (Math.random() - 0.5) * 300; // 中央から±150px
      noteY = viewportCenterY + (Math.random() - 0.5) * 300;
    }

    const newNote: Omit<Note, "id"> = {
      content: "",
      x: noteX,
      y: noteY,
      color: "#ffeb3b",
      userId: user?.uid || 'anonymous',
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
        type: "CREATE_NOTES",
        noteId: noteId,
        notes: [{ ...newNote, id: noteId }],
        userId: user?.uid || 'anonymous',
      });
    }

    const noteRef = ref(rtdb, `boardNotes/${boardId}/${noteId}`);
    set(noteRef, newNote);
    setNextZIndex((prev) => prev + 1);
    
    return noteId;
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
        note.userId === user?.uid &&
        currentUndoRedoNoteId !== noteId
      ) {
        // Don't track position changes during dragging - will be tracked on drag end
        // Track content changes
        if (
          updates.content !== undefined &&
          updates.content !== note.content &&
          !updates.isDragging
        ) {
          addToHistory({
            type: "EDIT_NOTE",
            noteId: noteId,
            oldContent: note.content,
            newContent: updates.content,
            userId: user?.uid || 'anonymous',
          });
        }
      }

      set(noteRef, updatedNote);
    }
  };

  const deleteNote = (noteId: string) => {
    const note = notes.find((n) => n.id === noteId);

    // Add to history only if it's user's own note and not undo/redo operation
    if (!isUndoRedoOperation && note && note.userId === user?.uid) {
      addToHistory({
        type: "DELETE_NOTES",
        noteId: noteId,
        notes: [note],
        userId: user?.uid || 'anonymous',
      });
    }

    const noteRef = ref(rtdb, `boardNotes/${boardId}/${noteId}`);
    remove(noteRef);
    // 選択状態も削除
    if (selectedNoteIds.has(noteId)) {
      setSelectedNoteIds((prev) => {
        const newSet = new Set(prev);
        newSet.delete(noteId);
        return newSet;
      });
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
    } else {
      // 通常の単一選択
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

    setSelectedNoteIds(new Set());
  };

  const handleBoardDoubleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    // 付箋やボタン上でのダブルクリックは無視
    const target = e.target as HTMLElement;
    if (target.closest(".sticky-note") || target.closest("button")) {
      return;
    }

    // マウスの座標をボード座標に変換
    const rect = boardRef.current?.getBoundingClientRect();
    if (!rect) return;

    const clickX = (e.clientX - rect.left - panX) / zoom;
    const clickY = (e.clientY - rect.top - panY) / zoom;

    // 付箋のサイズ（幅160px、高さ41.5px）
    const noteWidth = 160;
    const noteHeight = 41.5;

    // クリック位置が付箋の中心になるように座標を調整
    const boardX = clickX - noteWidth / 2;
    const boardY = clickY - noteHeight / 2;

    // 指定された座標に付箋を作成
    const newNoteId = addNote(boardX, boardY);
    
    // 作成した付箋にフォーカスを設定
    setNoteToFocus(newNoteId);
    
    // 作成した付箋を選択状態にする
    setSelectedNoteIds(new Set([newNoteId]));
  };

  // パンまたは範囲選択の開始
  const handleBoardMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    // 付箋やボタンをクリックした場合は何もしない
    const target = e.target as HTMLElement;
    if (target.closest(".sticky-note") || target.closest("button")) {
      return;
    }

    // Shiftキーで範囲選択、それ以外でパン
    if (e.shiftKey) {
      // 範囲選択の開始
      const rect = boardRef.current?.getBoundingClientRect() || {
        left: 0,
        top: 0,
      };
      // transform を考慮した座標計算
      const x = (e.clientX - rect.left - panX) / zoom;
      const y = (e.clientY - rect.top - panY) / zoom;

      setIsSelecting(true);
      setIsMultiSelectMode(false);
      setSelectionStart({ x, y });
      setSelectionEnd({ x, y });
      setJustFinishedSelection(false);

      // 既存の選択をクリア
      setSelectedNoteIds(new Set());
    } else {
      // 通常のドラッグでパン
      handlePanStart(e);
    }
  };

  // 範囲選択の更新
  const handleBoardMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!isSelecting || !selectionStart) return;

      const rect = boardRef.current?.getBoundingClientRect() || {
        left: 0,
        top: 0,
      };
      // transform を考慮した座標計算
      const x = (e.clientX - rect.left - panX) / zoom;
      const y = (e.clientY - rect.top - panY) / zoom;

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
    [
      isSelecting,
      selectionStart,
      notes,
      isMultiSelectMode,
      selectedNoteIds,
      boardRef,
      panX,
      panY,
      zoom,
    ]
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

      // ズームを考慮した移動距離計算
      const deltaX = (e.clientX - dragStartPos.x) / zoom;
      const deltaY = (e.clientY - dragStartPos.y) / zoom;

      selectedNoteIds.forEach((noteId) => {
        const initialPos = initialSelectedPositions[noteId];
        if (initialPos) {
          const newX = initialPos.x + deltaX;
          const newY = initialPos.y + deltaY;

          updateNote(noteId, {
            x: newX,
            y: newY,
            isDragging: true,
            draggedBy: user?.uid || 'anonymous',
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
      user?.uid,
    ]
  );

  // 一括移動の終了
  const handleBulkDragEnd = useCallback(() => {
    if (isDraggingMultiple && dragStartPos) {
      // 移動履歴を記録
      const moves: Array<{
        noteId: string;
        oldPosition: { x: number; y: number };
        newPosition: { x: number; y: number };
      }> = [];

      selectedNoteIds.forEach((noteId) => {
        const note = notes.find((n) => n.id === noteId);
        const initialPos = initialSelectedPositions[noteId];
        if (
          note &&
          initialPos &&
          (note.x !== initialPos.x || note.y !== initialPos.y)
        ) {
          moves.push({
            noteId,
            oldPosition: initialPos,
            newPosition: { x: note.x, y: note.y },
          });
        }
      });

      // 移動をhistoryに追加
      if (moves.length > 0 && !isUndoRedoOperation) {
        addToHistory({
          type: "MOVE_NOTES",
          noteId: moves[0].noteId, // 代表としてひとつ目のIDを使用
          userId: user?.uid || 'anonymous',
          moves: moves,
        });
      }

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
  }, [
    isDraggingMultiple,
    selectedNoteIds,
    updateNote,
    dragStartPos,
    notes,
    initialSelectedPositions,
    isUndoRedoOperation,
    addToHistory,
    user?.uid,
  ]);

  // パン操作の開始
  const handlePanStart = (e: React.MouseEvent) => {
    // 付箋や範囲選択が進行中の場合はパンしない
    if (isSelecting || isDraggingMultiple) return;

    setIsPanning(true);
    setPanStartPos({ x: e.clientX, y: e.clientY });
    setInitialPan({ x: panX, y: panY });
  };

  // パン操作の処理
  const handlePanMove = useCallback(
    (e: MouseEvent) => {
      if (!isPanning || !panStartPos || !initialPan) return;

      const deltaX = e.clientX - panStartPos.x;
      const deltaY = e.clientY - panStartPos.y;

      setPanX(initialPan.x + deltaX);
      setPanY(initialPan.y + deltaY);
    },
    [isPanning, panStartPos, initialPan]
  );

  // パン操作の終了
  const handlePanEnd = useCallback(() => {
    setIsPanning(false);
    setPanStartPos(null);
    setInitialPan(null);
  }, []);

  // ズーム操作（高感度・慣性付き）
  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      e.preventDefault();

      if (!boardRef.current) return;

      const currentTime = Date.now();
      const timeDelta = currentTime - lastWheelTime;
      
      // 中間的な感度設定
      const baseSensitivity = 0.001; // 基本感度を中間に
      const zoomFactor = Math.pow(1.2, -e.deltaY * baseSensitivity);
      
      // 速度の計算（連続したホイール操作で適度に加速）
      let velocity = e.deltaY * baseSensitivity;
      if (timeDelta < 50) { // 50ms以内の連続操作
        velocity *= 1.3; // 適度な加速
      }
      
      setLastWheelTime(currentTime);
      setZoomVelocity(velocity);

      // マウス位置を取得
      const rect = boardRef.current.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      // ズームターゲットを設定（最初のホイール操作時のみ）
      if (!zoomTarget || timeDelta > 200) { // 200ms以上経過したら新しいターゲット
        setZoomTarget({ x: mouseX, y: mouseY });
      }

      // 使用するターゲット位置
      const targetX = zoomTarget?.x || mouseX;
      const targetY = zoomTarget?.y || mouseY;

      // ズーム前のターゲット位置（ワールド座標）
      const worldTargetX = (targetX - panX) / zoom;
      const worldTargetY = (targetY - panY) / zoom;

      // 新しいズーム値を計算
      const newZoom = Math.max(0.1, Math.min(5, zoom * zoomFactor));

      // ズーム後にターゲット位置が同じ場所を指すようにパンを調整
      const newPanX = targetX - worldTargetX * newZoom;
      const newPanY = targetY - worldTargetY * newZoom;

      setZoom(newZoom);
      setPanX(newPanX);
      setPanY(newPanY);
    },
    [zoom, panX, panY, lastWheelTime, zoomTarget]
  );

  // ズーム慣性アニメーション
  useEffect(() => {
    if (Math.abs(zoomVelocity) > 0.001) {
      const animate = () => {
        setZoomVelocity((prevVelocity) => {
          const newVelocity = prevVelocity * 0.95; // 減衰率を上げてゆっくりに
          
          if (Math.abs(newVelocity) < 0.001) {
            // ズーム終了時にターゲットをクリア
            setZoomTarget(null);
            return 0;
          }
          
          // ズームターゲットが設定されていればそれを使用、なければビューポート中心
          const targetX = zoomTarget?.x || window.innerWidth / 2;
          const targetY = zoomTarget?.y || window.innerHeight / 2;
          
          setZoom((prevZoom) => {
            const zoomFactor = Math.pow(1.2, -newVelocity);
            const newZoom = Math.max(0.1, Math.min(5, prevZoom * zoomFactor));
            
            // パンも調整
            if (boardRef.current) {
              setPanX((prevPanX) => {
                const worldTargetX = (targetX - prevPanX) / prevZoom;
                return targetX - worldTargetX * newZoom;
              });
              
              setPanY((prevPanY) => {
                const worldTargetY = (targetY - prevPanY) / prevZoom;
                return targetY - worldTargetY * newZoom;
              });
            }
            
            return newZoom;
          });
          
          return newVelocity;
        });
        
        zoomAnimationRef.current = requestAnimationFrame(animate);
      };
      
      zoomAnimationRef.current = requestAnimationFrame(animate);
      
      return () => {
        if (zoomAnimationRef.current) {
          cancelAnimationFrame(zoomAnimationRef.current);
        }
      };
    }
  }, [zoomVelocity, zoomTarget]);

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

  // パン操作のイベントリスナー
  useEffect(() => {
    if (isPanning) {
      document.addEventListener("mousemove", handlePanMove);
      document.addEventListener("mouseup", handlePanEnd);
      return () => {
        document.removeEventListener("mousemove", handlePanMove);
        document.removeEventListener("mouseup", handlePanEnd);
      };
    }
  }, [isPanning, handlePanMove, handlePanEnd]);

  // ボード要素でのスクロール防止
  useEffect(() => {
    const boardElement = boardRef.current;
    if (!boardElement) return;

    const preventScroll = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();
    };

    // パッシブではないイベントリスナーを追加
    boardElement.addEventListener("wheel", preventScroll, { passive: false });
    
    return () => {
      boardElement.removeEventListener("wheel", preventScroll);
    };
  }, []);

  // サムネイル生成とローカル保存
  const generateAndSaveThumbnail = useCallback(async () => {
    if (!boardRef.current || !boardId) return;

    try {
      const thumbnailDataUrl = await generateBoardThumbnail(boardRef.current);
      if (thumbnailDataUrl) {
        await saveBoardThumbnail(boardId, thumbnailDataUrl);
      }
    } catch (error) {
      // Silent fail
    }
  }, [boardId]);

  // ページ離脱時やnotes変更時、ボード名変更時にサムネイルを生成
  useEffect(() => {
    if (notes.length === 0 && !boardName) return;

    const timeoutId = setTimeout(() => {
      generateAndSaveThumbnail();
    }, 2000); // 2秒後に生成（ユーザーの操作が落ち着いてから）

    return () => clearTimeout(timeoutId);
  }, [notes, boardName, generateAndSaveThumbnail]);

  // ページ離脱時にサムネイルを生成
  useEffect(() => {
    const handleBeforeUnload = () => {
      generateAndSaveThumbnail();
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      // コンポーネント破棄時にもサムネイル生成
      generateAndSaveThumbnail();
    };
  }, [generateAndSaveThumbnail]);

  // copyNote関数を削除 - copyNotesCompleteで統一

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

  // 付箋データを内部状態にコピー
  const copyNotesAsData = () => {
    if (selectedNoteIds.size === 0) {
      return;
    }

    const selectedNotes = notes.filter((note) => selectedNoteIds.has(note.id));
    setCopiedNotes(selectedNotes);
    // 複数選択の場合は単一コピーをクリア
    setCopiedNote(null);
  };

  // 統合されたコピー機能（画像とデータの両方）
  const copyNotesComplete = async () => {
    if (selectedNoteIds.size === 0) {
      return;
    }

    // 画像としてコピー
    await copyNotesAsImage();

    // データとしても内部状態にコピー
    copyNotesAsData();

    // 単一選択の場合はcopiedNoteも設定（後方互換性のため）
    if (selectedNoteIds.size === 1) {
      const noteId = Array.from(selectedNoteIds)[0];
      const note = notes.find((n) => n.id === noteId);
      if (note) {
        setCopiedNote(note);
      }
    } else {
      // 複数選択の場合は単一コピーをクリア
      setCopiedNote(null);
    }
  };

  // 複数選択された付箋を削除
  const deleteSelectedNotes = () => {
    const notesToDelete: Note[] = [];
    selectedNoteIds.forEach((noteId) => {
      const note = notes.find((n) => n.id === noteId);
      if (note && note.userId === user?.uid) {
        notesToDelete.push(note);
      }
    });

    if (notesToDelete.length > 0 && !isUndoRedoOperation) {
      addToHistory({
        type: "DELETE_NOTES",
        noteId: notesToDelete[0].id, // 代表としてひとつめのIDを使用
        notes: notesToDelete,
        userId: user?.uid || 'anonymous',
      });
    }

    // 実際の削除処理
    notesToDelete.forEach((note) => {
      const noteRef = ref(rtdb, `boardNotes/${boardId}/${note.id}`);
      remove(noteRef);
    });

    setSelectedNoteIds(new Set());
  };

  // コピーされた複数付箋を貼り付け
  const pasteCopiedNotes = () => {
    if (copiedNotes.length === 0) {
      return;
    }

    // 複数の付箋を作成
    let currentZIndex = nextZIndex;
    const createdNotes: Note[] = [];

    for (const noteData of copiedNotes) {
      const noteId = nanoid();
      const newNote: Note = {
        id: noteId,
        content: noteData.content,
        color: noteData.color,
        width: noteData.width || 250,
        x: noteData.x + 20, // 少しずらして配置
        y: noteData.y + 20,
        userId: user?.uid || 'anonymous',
        createdAt: Date.now(),
        zIndex: currentZIndex,
        isDragging: false,
        draggedBy: null,
        isEditing: false,
        editedBy: null,
      };

      const noteRef = ref(rtdb, `boardNotes/${boardId}/${noteId}`);
      set(noteRef, newNote);
      createdNotes.push(newNote);
      currentZIndex++;
    }

    // 一括でhistoryに追加
    if (createdNotes.length > 0 && !isUndoRedoOperation) {
      addToHistory({
        type: "CREATE_NOTES",
        noteId: createdNotes[0].id, // 代表としてひとつ目のIDを使用
        notes: createdNotes,
        userId: user?.uid || 'anonymous',
      });
    }

    setNextZIndex(currentZIndex);

    // 新しく作成された付箋を選択状態にする
    const newNoteIds = new Set(createdNotes.map((note) => note.id));
    setSelectedNoteIds(newNoteIds);
  };

  const pasteNote = () => {
    if (copiedNote) {
      // Remove id and other properties that should be unique
      const { id, ...noteData } = copiedNote;

      const newNote: Omit<Note, "id"> = {
        ...noteData,
        x: copiedNote.x + 20,
        y: copiedNote.y + 20,
        userId: user?.uid || 'anonymous',
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
          type: "CREATE_NOTES",
          noteId: noteId,
          notes: [{ ...newNote, id: noteId }],
          userId: user?.uid || 'anonymous',
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
    if (!action || action.userId !== user?.uid) return;

    setIsUndoRedoOperation(true);
    setCurrentUndoRedoNoteId(action.noteId);

    try {
      const noteRef = ref(rtdb, `boardNotes/${boardId}/${action.noteId}`);
      const note = notes.find((n) => n.id === action.noteId);

      switch (action.type) {
        case "CREATE_NOTES":
          if (action.notes) {
            action.notes.forEach((note) => {
              const createNoteRef = ref(
                rtdb,
                `boardNotes/${boardId}/${note.id}`
              );
              remove(createNoteRef);
            });
          }
          break;

        case "DELETE_NOTES":
          if (action.notes) {
            action.notes.forEach((note) => {
              const deleteNoteRef = ref(
                rtdb,
                `boardNotes/${boardId}/${note.id}`
              );
              set(deleteNoteRef, note);
            });
          }
          break;

        case "MOVE_NOTES":
          if (action.moves) {
            action.moves.forEach(({ noteId, oldPosition }) => {
              const moveNoteRef = ref(rtdb, `boardNotes/${boardId}/${noteId}`);
              const moveNote = notes.find((n) => n.id === noteId);
              if (moveNote) {
                set(moveNoteRef, { ...moveNote, ...oldPosition });
              }
            });
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
  }, [undo, user?.uid, boardId, notes]);

  const performRedo = useCallback(() => {
    const action = redo();
    if (!action || action.userId !== user?.uid) return;

    setIsUndoRedoOperation(true);
    setCurrentUndoRedoNoteId(action.noteId);

    try {
      const noteRef = ref(rtdb, `boardNotes/${boardId}/${action.noteId}`);
      const note = notes.find((n) => n.id === action.noteId);

      switch (action.type) {
        case "CREATE_NOTES":
          if (action.notes) {
            action.notes.forEach((note) => {
              const createNoteRef = ref(
                rtdb,
                `boardNotes/${boardId}/${note.id}`
              );
              set(createNoteRef, note);
            });
          }
          break;

        case "DELETE_NOTES":
          if (action.notes) {
            action.notes.forEach((note) => {
              const deleteNoteRef = ref(
                rtdb,
                `boardNotes/${boardId}/${note.id}`
              );
              remove(deleteNoteRef);
            });
          }
          break;

        case "MOVE_NOTES":
          if (action.moves) {
            action.moves.forEach(({ noteId, newPosition }) => {
              const moveNoteRef = ref(rtdb, `boardNotes/${boardId}/${noteId}`);
              const moveNote = notes.find((n) => n.id === noteId);
              if (moveNote) {
                set(moveNoteRef, { ...moveNote, ...newPosition });
              }
            });
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
  }, [redo, user?.uid, boardId, notes]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = async (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey) {
        if (e.key === "z" && !e.shiftKey) {
          e.preventDefault();
          performUndo();
        } else if (e.key === "y" || (e.key === "z" && e.shiftKey)) {
          e.preventDefault();
          performRedo();
        } else if (e.key === "c") {
          // Check if a textarea or input is focused
          const activeElement = document.activeElement;
          const isInputFocused =
            activeElement && (activeElement.tagName === "TEXTAREA" || activeElement.tagName === "INPUT");

          // Only copy if no input is focused
          if (!isInputFocused && selectedNoteIds.size > 0) {
            e.preventDefault();

            if (e.shiftKey) {
              // Shift+Cmd+C: Copy as image and data
              await copyNotesComplete();
            } else {
              // Cmd+C: Copy data only (lightweight)
              copyNotesAsData();

              // 単一選択の場合はcopiedNoteも設定
              if (selectedNoteIds.size === 1) {
                const noteId = Array.from(selectedNoteIds)[0];
                const note = notes.find((n) => n.id === noteId);
                if (note) {
                  setCopiedNote(note);
                }
              } else {
                setCopiedNote(null);
              }
            }
          }
          // If textarea is focused, let the default copy behavior happen
        } else if (e.key === "v") {
          // Check if a textarea or input is focused
          const activeElement = document.activeElement;
          const isInputFocused =
            activeElement && (activeElement.tagName === "TEXTAREA" || activeElement.tagName === "INPUT");

          // Only paste note if no input is focused
          if (!isInputFocused) {
            e.preventDefault();
            
            // Try to paste copied notes first, fallback to single copiedNote
            if (copiedNotes.length > 0) {
              pasteCopiedNotes();
            } else if (copiedNote) {
              pasteNote();
            } else {
              // If no internal notes are copied, try to paste from clipboard
              navigator.clipboard.readText().then((text) => {
                if (text.trim()) {
                  console.log('Pasting text from clipboard:', text);
                  createNotesFromText(text);
                }
              }).catch(() => {
                console.log('Failed to read clipboard');
              });
            }
          }
          // If input is focused, let the default paste behavior happen
        } else if (e.key === "a") {
          // テキストエリアやインプットにフォーカスがある場合は通常のテキスト選択を許可
          const activeElement = document.activeElement;
          const isInputFocused =
            activeElement && (activeElement.tagName === "TEXTAREA" || activeElement.tagName === "INPUT");

          if (!isInputFocused) {
            e.preventDefault();
            // Select all notes
            const allNoteIds = new Set(notes.map((note) => note.id));
            setSelectedNoteIds(allNoteIds);
          }
        } else if (e.key === "n") {
          // Check if a textarea or input is focused
          const activeElement = document.activeElement;
          const isInputFocused =
            activeElement && (activeElement.tagName === "TEXTAREA" || activeElement.tagName === "INPUT");

          // Only create new note if no input is focused
          if (!isInputFocused) {
            e.preventDefault();
            addNote();
          }
        }
      } else if (
        (e.key === "Delete" || e.key === "Backspace") &&
        selectedNoteIds.size > 0
      ) {
        // Delete selected notes if no input is focused
        const activeElement = document.activeElement;
        const isInputFocused =
          activeElement && (activeElement.tagName === "TEXTAREA" || activeElement.tagName === "INPUT");

        if (!isInputFocused) {
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
    // activeNoteId削除済み
    copiedNote,
    copiedNotes,
    nextZIndex,
    user?.uid,
    performUndo,
    performRedo,
    selectedNoteIds,
    notes,
    deleteSelectedNotes,
  ]);

  // 単一の付箋の移動完了時のコールバック
  const handleNoteDragEnd = useCallback(
    (
      noteId: string,
      oldPosition: { x: number; y: number },
      newPosition: { x: number; y: number }
    ) => {
      if (
        !isUndoRedoOperation &&
        (oldPosition.x !== newPosition.x || oldPosition.y !== newPosition.y)
      ) {
        addToHistory({
          type: "MOVE_NOTES",
          noteId: noteId,
          userId: user?.uid || 'anonymous',
          moves: [
            {
              noteId,
              oldPosition,
              newPosition,
            },
          ],
        });
      }
    },
    [isUndoRedoOperation, addToHistory, user?.uid]
  );

  // テキストから付箋を作成する関数
  const createNotesFromText = useCallback((text: string) => {
    console.log('createNotesFromText called with:', text);
    const lines = text.split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0);
    
    console.log('Processed lines:', lines);
    
    if (lines.length === 0) {
      console.log('No lines to create notes from');
      return;
    }

    // ビューポートの中央を基準点として設定
    const viewportCenterX = -panX / zoom + window.innerWidth / 2 / zoom;
    const viewportCenterY = -panY / zoom + window.innerHeight / 2 / zoom;
    
    // 複数の付箋を格子状に配置
    const cols = Math.ceil(Math.sqrt(lines.length));
    const rows = Math.ceil(lines.length / cols);
    const spacing = 200; // 付箋間のスペース
    
    // 開始位置を計算（中央に配置するため）
    const startX = viewportCenterX - (cols - 1) * spacing / 2;
    const startY = viewportCenterY - (rows - 1) * spacing / 2;
    
    const createdNotes: Note[] = [];
    
    console.log('Creating notes at positions:', { startX, startY, cols, rows, spacing });
    
    lines.forEach((line, index) => {
      const row = Math.floor(index / cols);
      const col = index % cols;
      
      const noteX = startX + col * spacing;
      const noteY = startY + row * spacing;
      
      const noteId = nanoid();
      const newNote: Note = {
        id: noteId,
        content: line,
        x: noteX,
        y: noteY,
        color: "#ffeb3b",
        userId: user?.uid || 'anonymous',
        createdAt: Date.now(),
        zIndex: nextZIndex + index,
        width: 160,
        isDragging: false,
        draggedBy: null,
      };
      
      console.log(`Creating note ${index + 1}/${lines.length}:`, { noteId, content: line, x: noteX, y: noteY });
      
      createdNotes.push(newNote);
      
      // Firebaseに保存
      const noteRef = ref(rtdb, `boardNotes/${boardId}/${noteId}`);
      set(noteRef, newNote);
    });
    
    // 履歴に追加
    if (!isUndoRedoOperation) {
      console.log('Adding to history:', createdNotes.length, 'notes');
      addToHistory({
        type: "CREATE_NOTES",
        noteId: createdNotes[0].id,
        notes: createdNotes,
        userId: user?.uid || 'anonymous',
      });
    }
    
    // zIndexを更新
    console.log('Updating nextZIndex from', nextZIndex, 'to', nextZIndex + lines.length);
    setNextZIndex(prev => prev + lines.length);
  }, [panX, panY, zoom, user?.uid, boardId, nanoid, nextZIndex, isUndoRedoOperation, addToHistory]);


  // ペーストイベントリスナーの登録（キーボードイベントで処理するため削除）
  // useEffect(() => {
  //   console.log('Registering paste event listener');
  //   document.addEventListener('paste', handlePaste);
  //   return () => {
  //     console.log('Removing paste event listener');
  //     document.removeEventListener('paste', handlePaste);
  //   };
  // }, [handlePaste]);

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
    <div className="board-container">
      <div
        ref={boardRef}
        className="board"
        onClick={handleBoardClick}
        onMouseDown={handleBoardMouseDown}
        onDoubleClick={handleBoardDoubleClick}
        onWheel={handleWheel}
        style={{
          overflow: "hidden",
        }}
      >
        <div
          ref={notesContainerRef}
          className="notes-container"
          style={{
            transform: `translate(${panX}px, ${panY}px) scale(${zoom})`,
            transformOrigin: "0 0",
          }}
        >
          {notes.map((note) => (
            <StickyNote
              key={note.id}
              note={note}
              onUpdate={updateNote}
              onDelete={deleteNote}
              isActive={
                selectedNoteIds.has(note.id) && selectedNoteIds.size === 1
              }
              isSelected={selectedNoteIds.has(note.id)}
              onActivate={handleActivateNote}
              onStartBulkDrag={startBulkDrag}
              currentUserId={user?.uid || 'anonymous'}
              getUserColor={getUserColor}
              isDraggingMultiple={isDraggingMultiple}
              zoom={zoom}
              onDragEnd={handleNoteDragEnd}
              hasMultipleSelected={selectedNoteIds.size > 1}
              shouldFocus={noteToFocus === note.id}
              onFocused={() => setNoteToFocus(null)}
              board={board}
              project={project}
            />
          ))}

          <CursorDisplay cursors={cursors} />
          {renderSelectionBox()}
        </div>
      </div>
      {board && checkBoardEditPermission(board, project, user?.uid || null).canEdit && (
        <button onClick={addNote} className="fab-add-btn">
          <LuPlus />
        </button>
      )}
    </div>
  );
}
