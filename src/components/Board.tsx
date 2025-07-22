import React, { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useSlugContext } from "../contexts/SlugContext";
import { customAlphabet } from "nanoid";
import { rtdb } from "../config/firebase";
import { ref, onValue, set, remove, get, update } from "firebase/database";
import { LuPlus } from "react-icons/lu";
import { MdContentCopy } from "react-icons/md";
import { StickyNote } from "./StickyNote";
import { ArrowSVG } from "./ArrowSVG";
import { CursorDisplay } from "./CursorDisplay";
import { Group } from "./Group";
import { useHistory } from "../hooks/useHistory";
import { useBoard } from "../hooks/useBoard";
import { useCursor } from "../hooks/useCursor";
import { getUserColor } from "../utils/colors";
import {
  copyStickyNoteToClipboard,
  copyMultipleStickyNotesToClipboard,
} from "../utils/clipboardUtils";
import { saveBoardThumbnail } from "../utils/thumbnailUtils";
import { checkBoardEditPermission } from "../utils/permissions";
import { User, Note, Arrow as ArrowType, Group as GroupType } from "../types";
import { generateNewBoardName, generateUniqueBoardName } from "../utils/boardNaming";
import { isNoteInSelection } from "../utils/noteUtils";
import { updateBoardViewTime } from "../utils/boardViewHistory";

interface BoardProps {
  user: User | null;
}

export function Board({ user }: BoardProps) {
  const navigate = useNavigate();
  const slugContext = useSlugContext();
  const { boardName: urlBoardName, boardId: legacyBoardId } = useParams<{ 
    boardName?: string; 
    boardId?: string; 
  }>();
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

  // 矢印関連の状態
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(
    new Set()
  );

  // グループ関連の状態
  const [groups, setGroups] = useState<GroupType[]>([]);
  const [selectedGroupIds, setSelectedGroupIds] = useState<Set<string>>(
    new Set()
  );
  // 矢印作成関連の状態（削除済み）
  // const [isCreatingArrow, setIsCreatingArrow] = useState<boolean>(false);
  // const [arrowStartPoint, setArrowStartPoint] = useState<{
  //   x: number;
  //   y: number;
  // } | null>(null);

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

  // グループドラッグ用の状態
  const [isDraggingGroup, setIsDraggingGroup] = useState<boolean>(false);
  const [draggingGroupId, setDraggingGroupId] = useState<string | null>(null);
  const [groupDragStartPos, setGroupDragStartPos] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const [initialGroupNotePositions, setInitialGroupNotePositions] = useState<
    Record<string, { x: number; y: number }>
  >({});

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

  // WASD パン用の状態（削除：カクカク移動のため不要）

  // ズーム慣性用の状態
  const [lastWheelTime, setLastWheelTime] = useState<number>(0);

  // 新しいボード作成の状態
  const [isCreatingBoard, setIsCreatingBoard] = useState<boolean>(false);

  // Vimiumスタイルのキーヒント用の状態
  const [isKeyHintMode, setIsKeyHintMode] = useState<boolean>(false);
  const [pressedKeyHistory, setPressedKeyHistory] = useState<Array<string>>([]);
  const [noteHintKeys, setNoteHintKeys] = useState<Map<string, string>>(
    new Map()
  );

  const boardRef = useRef<HTMLDivElement>(null);
  const notesContainerRef = useRef<HTMLDivElement>(null);

  const nanoid = customAlphabet("abcdefghijklmnopqrstuvwxyz0123456789", 21);

  // キーヒント生成用の文字列
  const HINT_CHARS = "asdfghjklqwertyuiopzxcvbnm";

  // キーヒントを生成する関数
  const generateHintKeys = useCallback((noteIds: string[]) => {
    const hintMap = new Map<string, string>();
    const chars = HINT_CHARS.split("");

    // 単一文字でカバーできる場合
    if (noteIds.length <= chars.length) {
      noteIds.forEach((id, index) => {
        hintMap.set(id, chars[index]);
      });
    } else {
      // 2文字の組み合わせが必要な場合
      let hintIndex = 0;
      for (let i = 0; i < chars.length && hintIndex < noteIds.length; i++) {
        for (let j = 0; j < chars.length && hintIndex < noteIds.length; j++) {
          hintMap.set(noteIds[hintIndex], chars[i] + chars[j]);
          hintIndex++;
        }
      }
    }

    return hintMap;
  }, []);

  const { addToHistory, undo, redo } = useHistory();
  const {
    boardId,
    notes,
    arrows,
    cursors,
    projectId,
    isCheckingAccess,
    board,
    project,
  } = useBoard(user, navigate, sessionId);

  // Auto-create missing board
  const { isCreatingMissingBoard } = useAutoCreateBoard(
    boardId,
    board,
    isCheckingAccess,
    user,
    projectId,
    urlBoardName,
    legacyBoardId,
    navigate
  );

  // グループを読み込む
  useEffect(() => {
    if (!boardId) return;

    const groupsRef = ref(rtdb, `boards/${boardId}/groups`);
    const unsubscribe = onValue(groupsRef, (snapshot) => {
      if (snapshot.exists()) {
        const groupsData = snapshot.val();
        const groupsList = Object.entries(groupsData).map(
          ([id, group]: [string, any]) => ({
            ...group,
            id,
          })
        ) as GroupType[];
        setGroups(groupsList);
      } else {
        setGroups([]);
      }
    });

    return () => unsubscribe();
  }, [boardId]);

  // ボードの閲覧時刻を記録（ページを離れる時のみ）
  useEffect(() => {
    if (!boardId) return;

    const handleBeforeUnload = () => {
      updateBoardViewTime(boardId);
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        updateBoardViewTime(boardId);
      }
    };

    // ページを離れる時、タブを切り替える時に閲覧時刻を更新
    window.addEventListener("beforeunload", handleBeforeUnload);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      // クリーンアップ時（コンポーネントがアンマウントされる時）にも更新
      updateBoardViewTime(boardId);
      window.removeEventListener("beforeunload", handleBeforeUnload);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [boardId]);

  // ボードの情報とタイムスタンプを更新する関数
  const updateBoardMetadata = async () => {
    if (!boardId || !user?.uid || !notes) return;
    try {
      const { updateBoardMetadata: updateMetadata } = await import(
        "../utils/boardMetadata"
      );
      await updateMetadata(boardId, notes);
    } catch (error) {
      console.error("Error updating board metadata:", error);
    }
  };

  const cursorColor = getUserColor(user?.uid || "anonymous");

  // Use cursor tracking hook
  useCursor({
    boardId,
    user: user || {
      uid: "anonymous",
      email: null,
      displayName: "Anonymous",
      photoURL: null,
    },
    sessionId,
    cursorColor,
    panX,
    panY,
    zoom,
  });

  // ハッシュがない場合の初期位置を設定
  useEffect(() => {
    const hash = window.location.hash.slice(1);
    // ハッシュがある場合は別のeffectで処理するのでスキップ
    if (hash) return;

    // ハッシュがない場合は画面中央を原点に
    if (boardRef.current) {
      const rect = boardRef.current.getBoundingClientRect();
      setPanX(rect.width / 2);
      setPanY(rect.height / 2);
    }
  }, []);

  // 初期ハッシュ処理（一回のみ実行）
  const initialHashProcessed = useRef(false);
  useEffect(() => {
    if (notes.length === 0) return;
    if (initialHashProcessed.current) return;

    const hash = window.location.hash.slice(1);
    console.log("Debug: Initial hash processing:", hash, notes.length);

    if (hash) {
      const note = notes.find((n) => n.id === hash);
      console.log("Debug: Found note for hash:", note);
      console.log("Debug: boardRef.current:", boardRef.current);
      if (note) {
        // 画面の中央に付箋の中心を配置
        const centerX = window.innerWidth / 2;
        const centerY = window.innerHeight / 2;
        // 付箋のサイズを考慮（一般的な付箋サイズ: 幅200px, 高さ150px）
        const noteWidth = 200;
        const noteHeight = 150;
        setPanX(centerX - note.x - noteWidth / 2);
        setPanY(centerY - note.y - noteHeight / 2);
        setSelectedNoteIds(new Set([hash]));
        console.log("Debug: Applied initial hash processing");
      }
    }

    initialHashProcessed.current = true;
  }, [notes]);

  // 付箋選択時のURL更新（手動で呼び出す方式に変更）
  const updateUrlForNote = useCallback((noteId: string | null) => {
    if (noteId) {
      window.history.replaceState(null, "", `#${noteId}`);
    } else {
      window.history.replaceState(
        null,
        "",
        window.location.pathname + window.location.search
      );
    }
  }, []);

  // ボードアクセス時に選択状態をリセット
  useEffect(() => {
    // ボードが読み込まれた時に選択状態を初期化
    setSelectedNoteIds(new Set());
    setSelectedItemIds(new Set());
    setSelectedGroupIds(new Set());
    updateUrlForNote(null);
    
    // ボードアクセス時に閲覧時刻を更新（未読マークをクリア）
    if (boardId) {
      updateBoardViewTime(boardId);
    }
  }, [boardId, updateUrlForNote]);

  // WASD パンアニメーション（削除：カクカク移動のため不要）

  // URLハッシュの変更を監視（一時的に無効化してテスト）
  // useEffect(() => {
  //   const handleHashChange = () => {
  //     const hash = window.location.hash.slice(1);
  //     if (hash && notes.length > 0) {
  //       const note = notes.find((n) => n.id === hash);
  //       if (note) {
  //         setSelectedNoteIds(new Set([hash]));
  //       }
  //     }
  //   };

  //   window.addEventListener("hashchange", handleHashChange);
  //   return () => window.removeEventListener("hashchange", handleHashChange);
  // }, [notes]);

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

    const projectRef = ref(
      rtdb,
      `projects/${projectId}/members/${user?.uid || "anonymous"}`
    );
    const unsubscribeProject = onValue(projectRef, async (snapshot) => {
      if (!snapshot.exists()) {
        // User was removed from project
        const projectFullRef = ref(rtdb, `projects/${projectId}`);
        const projectSnapshot = await get(projectFullRef);
        if (projectSnapshot.exists()) {
          const projectData = projectSnapshot.val();
          if (!projectData.isPublic) {
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
    // 未ログインユーザーは付箋を作成できない
    if (!user?.uid) return "";

    // 権限チェック
    if (!board || !checkBoardEditPermission(board, project, user.uid).canEdit) {
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
      type: "note",
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

    // Add to history only if it's user's own action (not undo/redo)
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

    // 新しい付箋にフォーカスを設定
    setNoteToFocus(noteId);
    // 新しい付箋を選択状態にする
    setSelectedNoteIds(new Set([noteId]));
    updateUrlForNote(noteId);

    // ボードの更新時刻を更新（非同期で実行、エラーがあってもメイン処理に影響しない）
    setTimeout(() => {
      try {
        updateBoardMetadata();
      } catch (error) {
        console.error(
          "Error updating board timestamp after adding note:",
          error
        );
      }
    }, 100);

    return noteId;
  };

  const addArrow = (): string => {
    // 未ログインユーザーは矢印を作成できない
    if (!user?.uid) return "";

    // 権限チェック
    if (!board || !checkBoardEditPermission(board, project, user.uid).canEdit) {
      return "";
    }

    // 2つの付箋が選択されている必要がある
    const selectedNoteArray = Array.from(selectedNoteIds);
    if (selectedNoteArray.length !== 2) {
      // ボタンからの呼び出しの場合はアラートを表示しない（条件分岐で制御）
      console.warn("矢印を作成するには、ちょうど2つの付箋を選択してください。");
      return "";
    }

    const [startNoteId, endNoteId] = selectedNoteArray;

    const newArrow: Omit<ArrowType, "id"> = {
      type: "arrow",
      startNoteId,
      endNoteId,
      userId: user.uid,
      createdAt: Date.now(),
      zIndex: nextZIndex,
      isDragging: false,
      draggedBy: null,
    };

    const arrowId = nanoid();

    const arrowRef = ref(rtdb, `boards/${boardId}/arrows/${arrowId}`);
    set(arrowRef, newArrow);
    setNextZIndex((prev) => prev + 1);

    // 履歴に追加
    addToHistory({
      type: "CREATE_ARROW",
      userId: user.uid,
      arrow: { ...newArrow, id: arrowId },
    });

    // 矢印作成後、付箋の選択をクリア
    setSelectedNoteIds(new Set());
    // 新しい矢印を選択状態にする
    setSelectedItemIds(new Set([arrowId]));

    return arrowId;
  };

  // グループ作成関数
  const createGroup = (): string => {
    // 未ログインユーザーはグループを作成できない
    if (!user?.uid) return "";

    // 権限チェック
    if (!board || !checkBoardEditPermission(board, project, user.uid).canEdit) {
      return "";
    }

    // 2つ以上の付箋が選択されている必要がある
    const selectedNoteArray = Array.from(selectedNoteIds);
    if (selectedNoteArray.length < 2) {
      console.warn("グループを作成するには、2つ以上の付箋を選択してください。");
      return "";
    }

    const newGroup: Omit<GroupType, "id"> = {
      type: "group",
      noteIds: selectedNoteArray,
      userId: user.uid,
      createdAt: Date.now(),
      zIndex: nextZIndex,
      isDragging: false,
      draggedBy: null,
      color: "rgba(91, 151, 255, 0.1)",
    };

    const groupId = nanoid();

    const groupRef = ref(rtdb, `boards/${boardId}/groups/${groupId}`);
    set(groupRef, newGroup);
    setNextZIndex((prev) => prev + 1);

    // 履歴に追加
    addToHistory({
      type: "CREATE_GROUP",
      userId: user.uid,
      group: { ...newGroup, id: groupId },
    });

    // グループ作成後、付箋の選択をクリア
    setSelectedNoteIds(new Set());
    // 新しいグループを選択状態にする
    setSelectedGroupIds(new Set([groupId]));

    return groupId;
  };

  const updateArrow = (arrowId: string, updates: Partial<ArrowType>) => {
    // 未ログインユーザーは矢印を更新できない
    if (!user?.uid) return;

    const arrowRef = ref(rtdb, `boards/${boardId}/arrows/${arrowId}`);
    const arrow = arrows.find((a) => a.id === arrowId);
    if (arrow) {
      const updatedArrow = {
        ...arrow,
        ...updates,
      };

      set(arrowRef, updatedArrow);
    }
  };

  const deleteArrow = (arrowId: string) => {
    // 未ログインユーザーは矢印を削除できない
    if (!user?.uid) return;

    // 削除前に矢印のデータを保存（履歴用）
    const arrow = arrows.find((a) => a.id === arrowId);
    if (!arrow) return;

    const arrowRef = ref(rtdb, `boards/${boardId}/arrows/${arrowId}`);
    remove(arrowRef);

    // 履歴に追加
    addToHistory({
      type: "DELETE_ARROW",
      userId: user.uid,
      arrow: arrow,
    });

    // 選択状態も削除
    if (selectedItemIds.has(arrowId)) {
      setSelectedItemIds((prev) => {
        const newSet = new Set(prev);
        newSet.delete(arrowId);
        return newSet;
      });
    }
  };

  const updateNote = (noteId: string, updates: Partial<Note>) => {
    // 未ログインユーザーは付箋を更新できない
    if (!user?.uid) return;

    const noteRef = ref(rtdb, `boards/${boardId}/notes/${noteId}`);
    const note = notes.find((n) => n.id === noteId);
    if (note) {
      // updatedAtを追加（updatedAtが明示的に指定された場合のみ）
      const shouldUpdateTimestamp = updates.updatedAt !== undefined;

      console.log('Board updateNote:', {
        noteId,
        updates: JSON.stringify(updates),
        shouldUpdateTimestamp,
        hasUpdatedAtInUpdates: 'updatedAt' in updates,
        updatedAtValue: updates.updatedAt
      });

      const updatedNote = {
        ...note,
        ...updates,
        ...(shouldUpdateTimestamp && { updatedAt: updates.updatedAt || Date.now() }),
      };
      
      console.log('Final updatedNote updatedAt:', updatedNote.updatedAt);

      // Add to history only for significant changes by the current user
      // Skip history tracking if this is an undo/redo operation for this specific note
      if (
        !isUndoRedoOperation &&
        note.userId === user.uid &&
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
            userId: user.uid,
          });
        }
      }

      set(noteRef, updatedNote);

      // ボードの更新時刻を更新（内容が変更された場合のみ）
      if (updates.content !== undefined && updates.content !== note.content) {
        setTimeout(() => {
          try {
            updateBoardMetadata();
          } catch (error) {
            console.error(
              "Error updating board timestamp after updating note:",
              error
            );
          }
        }, 100);
      }
    }
  };

  const deleteNote = (noteId: string) => {
    // 未ログインユーザーは付箋を削除できない
    if (!user?.uid) return;

    const note = notes.find((n) => n.id === noteId);

    // Add to history only if it's user's own note and not undo/redo operation
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

    // 削除された付箋に接続された矢印を削除
    arrows.forEach((arrow) => {
      if (arrow.startNoteId === noteId || arrow.endNoteId === noteId) {
        deleteArrow(arrow.id);
      }
    });

    // ボードの更新時刻を更新
    setTimeout(() => {
      try {
        updateBoardMetadata();
      } catch (error) {
        console.error(
          "Error updating board timestamp after deleting note:",
          error
        );
      }
    }, 100);

    // 選択状態も削除
    if (selectedNoteIds.has(noteId)) {
      setSelectedNoteIds((prev) => {
        const newSet = new Set(prev);
        newSet.delete(noteId);
        return newSet;
      });
    }
  };

  // 付箋を最前面に移動する関数
  const bringNoteToFront = (noteId: string) => {
    updateNote(noteId, { zIndex: nextZIndex });
    setNextZIndex((prev) => prev + 1);
  };

  const handleActivateNote = (
    noteId: string,
    isMultiSelect: boolean = false,
    isShiftSelect: boolean = false
  ) => {
    // 一括ドラッグ直後や範囲選択直後はアクティベートを無視
    if (isDraggingMultiple || justFinishedBulkDrag || justFinishedSelection) {
      return;
    }

    if (isMultiSelect && !isShiftSelect) {
      // Ctrl/Cmdキーが押されている場合は最前面に移動
      bringNoteToFront(noteId);
      // 単一選択に設定
      setSelectedNoteIds(new Set([noteId]));
      updateUrlForNote(noteId);
    } else if (isShiftSelect) {
      // Shiftキーが押されている場合は複数選択
      const newSelectedIds = new Set(selectedNoteIds);
      if (newSelectedIds.has(noteId)) {
        newSelectedIds.delete(noteId);
      } else {
        newSelectedIds.add(noteId);
      }
      setSelectedNoteIds(newSelectedIds);
      // 複数選択時はURL更新しない
    } else {
      // 通常の単一選択（zIndexは変更しない）
      setSelectedNoteIds(new Set([noteId]));
      updateUrlForNote(noteId);
    }
  };

  const handleSelectArrow = (
    arrowId: string,
    _isMultiSelect: boolean = false,
    isShiftSelect: boolean = false
  ) => {
    if (isShiftSelect) {
      // Shiftキーが押されている場合は複数選択
      const newSelectedIds = new Set(selectedItemIds);
      if (newSelectedIds.has(arrowId)) {
        newSelectedIds.delete(arrowId);
      } else {
        newSelectedIds.add(arrowId);
      }
      setSelectedItemIds(newSelectedIds);
    } else {
      // 通常の単一選択
      setSelectedItemIds(new Set([arrowId]));
      // 付箋の選択をクリア
      setSelectedNoteIds(new Set());
    }
  };

  const handleSelectGroup = (
    groupId: string,
    _isMultiSelect: boolean = false,
    isShiftSelect: boolean = false
  ) => {
    if (isShiftSelect) {
      // Shiftキーが押されている場合は複数選択
      const newSelectedIds = new Set(selectedGroupIds);
      if (newSelectedIds.has(groupId)) {
        newSelectedIds.delete(groupId);
      } else {
        newSelectedIds.add(groupId);
      }
      setSelectedGroupIds(newSelectedIds);
    } else {
      // 通常の単一選択
      setSelectedGroupIds(new Set([groupId]));
      // 付箋と矢印の選択をクリア
      setSelectedNoteIds(new Set());
      setSelectedItemIds(new Set());
    }
  };

  const handleBoardClick = () => {
    // 範囲選択終了直後や一括ドラッグ終了直後はクリックを無視
    if (isSelecting || justFinishedSelection || justFinishedBulkDrag) {
      return;
    }

    setSelectedNoteIds(new Set());
    setSelectedItemIds(new Set());
    setSelectedGroupIds(new Set());
    updateUrlForNote(null);
  };

  // 選択された付箋から新しいボードを作成
  const createBoardFromSelection = async () => {
    if (!user || !boardId || !project || isCreatingBoard) return;

    // 選択された付箋を取得
    const selectedNotes = notes.filter((note) => selectedNoteIds.has(note.id));

    if (selectedNotes.length === 0) return;

    // 確認ダイアログ
    const confirmed = window.confirm(
      `Create a new board with ${selectedNotes.length} selected notes?`
    );
    if (!confirmed) return;

    setIsCreatingBoard(true);

    // 新しいボードを作成
    const newBoardId = nanoid();
    const now = Date.now();

    // 重複しない一意なボード名を生成
    const uniqueName = await generateNewBoardName(project.id);

    const newBoard = {
      createdBy: user.uid,
      createdAt: now,
      updatedAt: now,
      projectId: project.id,
      name: uniqueName,
    };

    try {
      // ボードを作成
      const boardRef = ref(rtdb, `boards/${newBoardId}`);
      await set(boardRef, newBoard);

      // プロジェクトボードの参照も作成（正しいパス）
      const projectBoardRef = ref(
        rtdb,
        `projectBoards/${project.id}/${newBoardId}`
      );
      await set(projectBoardRef, newBoard);

      // 選択された付箋を新しいボードにコピー
      // 付箋の最小位置を求めて、新しいボードの中央付近に配置
      const minX = Math.min(...selectedNotes.map((note) => note.x));
      const minY = Math.min(...selectedNotes.map((note) => note.y));
      const centerX = 0; // 新しいボードの中央
      const centerY = 0;
      const offsetX = centerX - minX;
      const offsetY = centerY - minY;

      const notePromises = selectedNotes.map((note) => {
        const newNoteId = nanoid();
        const newNote: Note = {
          id: newNoteId,
          type: "note",
          content: note.content || "",
          x: note.x + offsetX,
          y: note.y + offsetY,
          width: "auto",
          zIndex: note.zIndex || 100,
          createdAt: Date.now(),
          userId: user.uid,
          isDragging: false,
          draggedBy: null,
          isEditing: false,
          editedBy: null,
        };

        // オプションフィールドは値が存在する場合のみ追加
        if (note.color) {
          newNote.color = note.color;
        }
        if (note.textSize) {
          newNote.textSize = note.textSize;
        }
        if (note.signedBy) {
          newNote.signedBy = note.signedBy;
        }

        const noteRef = ref(rtdb, `boards/${newBoardId}/notes/${newNoteId}`);
        return set(noteRef, newNote);
      });

      await Promise.all(notePromises);

      // プロジェクトのslugを取得してから新しいボードにナビゲート
      if (project.slug) {
        // プロジェクトslugがある場合は、slug形式でナビゲート
        navigate(`/${project.slug}/${encodeURIComponent(uniqueName)}`);
      } else {
        // slugがない場合はレガシー形式でナビゲート（互換性のため）
        navigate(`/${newBoardId}`);
      }
    } catch (error) {
      console.error("Error creating board from selection:", error);
      alert("Failed to create new board. Please try again.");
    } finally {
      setIsCreatingBoard(false);
    }
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

    // 付箋の基本サイズ（新規作成時）
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
    updateUrlForNote(newNoteId);
  };

  // パンまたは範囲選択の開始
  const handleBoardMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    // ボタンをクリックした場合は何もしない
    const target = e.target as HTMLElement;
    if (target.closest("button")) {
      return;
    }

    // 透明な付箋以外の付箋をクリックした場合は何もしない
    const stickyNote = target.closest(".sticky-note");
    if (stickyNote) {
      const noteElement = stickyNote as HTMLElement;
      const isTransparent =
        noteElement.style.backgroundColor === "transparent" ||
        noteElement.style.background === "transparent";
      if (!isTransparent) {
        return;
      }
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
      updateUrlForNote(null);
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
        return isNoteInSelection(note, { minX, minY, maxX, maxY });
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

  // グループドラッグの開始
  const startGroupDrag = (groupId: string, e: React.MouseEvent<SVGElement>) => {
    // 権限チェック
    if (!user?.uid) return;

    const group = groups.find((g) => g.id === groupId);
    if (!group || group.userId !== user.uid) return;

    setIsDraggingGroup(true);
    setDraggingGroupId(groupId);
    setGroupDragStartPos({ x: e.clientX, y: e.clientY });

    // グループ内の付箋の初期位置を記録
    const positions: Record<string, { x: number; y: number }> = {};
    group.noteIds.forEach((noteId) => {
      const note = notes.find((n) => n.id === noteId);
      if (note) {
        positions[noteId] = { x: note.x, y: note.y };
      }
    });
    setInitialGroupNotePositions(positions);
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
            draggedBy: user?.uid,
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
      zoom,
    ]
  );

  // グループドラッグの処理
  const handleGroupDragMove = useCallback(
    (e: MouseEvent) => {
      if (!isDraggingGroup || !groupDragStartPos || !draggingGroupId) return;

      // ズームを考慮した移動距離計算
      const deltaX = (e.clientX - groupDragStartPos.x) / zoom;
      const deltaY = (e.clientY - groupDragStartPos.y) / zoom;

      const group = groups.find((g) => g.id === draggingGroupId);
      if (!group) return;

      group.noteIds.forEach((noteId) => {
        const initialPos = initialGroupNotePositions[noteId];
        if (initialPos) {
          const newX = initialPos.x + deltaX;
          const newY = initialPos.y + deltaY;

          updateNote(noteId, {
            x: newX,
            y: newY,
            isDragging: true,
            draggedBy: user?.uid,
          });
        }
      });
    },
    [
      isDraggingGroup,
      groupDragStartPos,
      draggingGroupId,
      initialGroupNotePositions,
      groups,
      updateNote,
      user?.uid,
      zoom,
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
      if (moves.length > 0 && !isUndoRedoOperation && user?.uid) {
        addToHistory({
          type: "MOVE_NOTES",
          noteId: moves[0].noteId, // 代表としてひとつ目のIDを使用
          userId: user.uid,
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

  // グループドラッグの終了
  const handleGroupDragEnd = useCallback(() => {
    if (isDraggingGroup && groupDragStartPos && draggingGroupId) {
      const group = groups.find((g) => g.id === draggingGroupId);
      if (!group) return;

      // 移動履歴を記録
      const moves: Array<{
        noteId: string;
        oldPosition: { x: number; y: number };
        newPosition: { x: number; y: number };
      }> = [];

      group.noteIds.forEach((noteId) => {
        const note = notes.find((n) => n.id === noteId);
        const initialPos = initialGroupNotePositions[noteId];
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
      if (moves.length > 0 && !isUndoRedoOperation && user?.uid) {
        addToHistory({
          type: "MOVE_NOTES",
          noteId: moves[0].noteId,
          userId: user.uid,
          moves: moves,
        });
      }

      // 最終位置を確定
      group.noteIds.forEach((noteId) => {
        updateNote(noteId, {
          isDragging: false,
          draggedBy: null,
        });
      });

      // グループドラッグ状態をクリア
      setIsDraggingGroup(false);
      setDraggingGroupId(null);
      setGroupDragStartPos(null);
      setInitialGroupNotePositions({});
    }
  }, [
    isDraggingGroup,
    groupDragStartPos,
    draggingGroupId,
    groups,
    notes,
    initialGroupNotePositions,
    isUndoRedoOperation,
    addToHistory,
    user?.uid,
    updateNote,
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
      // preventDefaultは既にuseEffectで非passiveリスナーで実行されるため削除

      if (!boardRef.current) return;

      const currentTime = Date.now();
      const timeDelta = currentTime - lastWheelTime;

      // ズーム感度を調整（より敏感に）
      const baseSensitivity = 0.005; // 感度を3倍に上げる
      const zoomFactor = Math.pow(1.2, -e.deltaY * baseSensitivity);

      // 速度の計算は不要（未使用変数のため削除）

      setLastWheelTime(currentTime);
      // setZoomVelocity(velocity); // 慣性を無効化

      // マウス位置を取得
      const rect = boardRef.current.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      // ズームターゲットを設定（慣性無効時は毎回マウス位置を使用）
      const targetX = mouseX;
      const targetY = mouseY;

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
    [zoom, panX, panY, lastWheelTime]
  );

  // ズーム慣性アニメーション（無効化）
  // useEffect(() => {
  //   if (Math.abs(zoomVelocity) > 0.001) {
  //     const animate = () => {
  //       setZoomVelocity((prevVelocity) => {
  //         const newVelocity = prevVelocity * 0.95; // 減衰率を上げてゆっくりに

  //         if (Math.abs(newVelocity) < 0.001) {
  //           // ズーム終了時にターゲットをクリア
  //           setZoomTarget(null);
  //           return 0;
  //         }

  //         // ズームターゲットが設定されていればそれを使用、なければビューポート中心
  //         const targetX = zoomTarget?.x || window.innerWidth / 2;
  //         const targetY = zoomTarget?.y || window.innerHeight / 2;

  //         setZoom((prevZoom) => {
  //           const zoomFactor = Math.pow(1.2, -newVelocity);
  //           const newZoom = Math.max(0.1, Math.min(5, prevZoom * zoomFactor));

  //           // パンも調整
  //           if (boardRef.current) {
  //             setPanX((prevPanX) => {
  //               const worldTargetX = (targetX - prevPanX) / prevZoom;
  //               return targetX - worldTargetX * newZoom;
  //             });

  //             setPanY((prevPanY) => {
  //               const worldTargetY = (targetY - prevPanY) / prevZoom;
  //               return targetY - worldTargetY * newZoom;
  //             });
  //           }

  //           return newZoom;
  //         });

  //         return newVelocity;
  //       });

  //       zoomAnimationRef.current = requestAnimationFrame(animate);
  //     };

  //     zoomAnimationRef.current = requestAnimationFrame(animate);

  //     return () => {
  //       if (zoomAnimationRef.current) {
  //         cancelAnimationFrame(zoomAnimationRef.current);
  //       }
  //     };
  //   }
  // }, [zoomVelocity, zoomTarget]);

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

  // グループドラッグのイベントリスナー
  useEffect(() => {
    if (isDraggingGroup) {
      document.addEventListener("mousemove", handleGroupDragMove);
      document.addEventListener("mouseup", handleGroupDragEnd);
      return () => {
        document.removeEventListener("mousemove", handleGroupDragMove);
        document.removeEventListener("mouseup", handleGroupDragEnd);
      };
    }
  }, [isDraggingGroup, handleGroupDragMove, handleGroupDragEnd]);

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

  // #から始まる付箋の画像をサムネイルとして保存
  const generateAndSaveThumbnail = useCallback(async () => {
    if (!boardId) return;

    // #で始まる付箋を探す
    const hashNote = notes.find(
      (note) => note.content && note.content.trim().startsWith("#")
    );
    if (!hashNote) return;

    // 付箋内の画像URLを探す
    let thumbnailUrl = null;

    // Gyazo URLを探す
    const gyazoMatch = hashNote.content.match(
      /https:\/\/gyazo\.com\/([a-zA-Z0-9]+)/
    );
    if (gyazoMatch) {
      const id = gyazoMatch[1];
      thumbnailUrl = `https://gyazo.com/${id}/max_size/300`;
    } else {
      // その他の画像URLを探す
      const imageMatch = hashNote.content.match(
        /(https?:\/\/[^\s]+\.(jpg|jpeg|png|gif|webp))/i
      );
      if (imageMatch) {
        thumbnailUrl = imageMatch[1];
      }
    }

    if (thumbnailUrl) {
      await saveBoardThumbnail(boardId, thumbnailUrl);
    }
  }, [boardId, notes]);

  // ノートが変更された時にサムネイルを更新
  useEffect(() => {
    if (notes.length === 0) return;

    const timeoutId = setTimeout(() => {
      generateAndSaveThumbnail();
    }, 2000); // 2秒後に生成（ユーザーの操作が落ち着いてから）

    return () => clearTimeout(timeoutId);
  }, [notes, generateAndSaveThumbnail]);

  // copyNote関数を削除 - copyNotesCompleteで統一

  // 付箋を画像としてクリップボードにコピー
  const copyNotesAsImage = async () => {
    if (selectedNoteIds.size === 0) {
      return;
    }

    const noteIds = Array.from(selectedNoteIds);
    if (noteIds.length === 1) {
      await copyStickyNoteToClipboard(noteIds[0]);
    } else {
      await copyMultipleStickyNotesToClipboard(noteIds);
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
    // 未ログインユーザーは付箋を削除できない
    if (!user?.uid) return;

    const notesToDelete: Note[] = [];
    selectedNoteIds.forEach((noteId) => {
      const note = notes.find((n) => n.id === noteId);
      if (note && note.userId === user.uid) {
        notesToDelete.push(note);
      }
    });

    if (notesToDelete.length > 0 && !isUndoRedoOperation) {
      addToHistory({
        type: "DELETE_NOTES",
        noteId: notesToDelete[0].id, // 代表としてひとつめのIDを使用
        notes: notesToDelete,
        userId: user.uid,
      });
    }

    // 実際の削除処理
    notesToDelete.forEach((note) => {
      const noteRef = ref(rtdb, `boards/${boardId}/notes/${note.id}`);
      remove(noteRef);
    });

    setSelectedNoteIds(new Set());
    updateUrlForNote(null);
  };

  // 複数選択された矢印を削除
  const deleteSelectedArrows = () => {
    // 未ログインユーザーは矢印を削除できない
    if (!user?.uid) return;

    selectedItemIds.forEach((arrowId) => {
      const arrow = arrows.find((a) => a.id === arrowId);
      if (arrow && arrow.userId === user.uid) {
        deleteArrow(arrowId);
      }
    });

    setSelectedItemIds(new Set());
  };

  // 複数選択されたグループを削除
  const deleteSelectedGroups = () => {
    // 未ログインユーザーはグループを削除できない
    if (!user?.uid) return;

    selectedGroupIds.forEach((groupId) => {
      const group = groups.find((g) => g.id === groupId);
      if (group && group.userId === user.uid) {
        deleteGroup(groupId);
      }
    });

    setSelectedGroupIds(new Set());
  };

  // 単一グループを削除
  const deleteGroup = (groupId: string) => {
    // 未ログインユーザーはグループを削除できない
    if (!user?.uid) return;

    // 削除前にグループのデータを保存（履歴用）
    const group = groups.find((g) => g.id === groupId);
    if (!group) return;

    const groupRef = ref(rtdb, `boards/${boardId}/groups/${groupId}`);
    remove(groupRef);

    // 履歴に追加
    addToHistory({
      type: "DELETE_GROUP",
      userId: user.uid,
      group: group,
    });

    // 選択状態も削除
    if (selectedGroupIds.has(groupId)) {
      setSelectedGroupIds((prev) => {
        const newSet = new Set(prev);
        newSet.delete(groupId);
        return newSet;
      });
    }
  };

  // コピーされた複数付箋を貼り付け
  const pasteCopiedNotes = () => {
    // 未ログインユーザーは付箋を貼り付けできない
    if (!user?.uid) return;

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
        type: "note",
        content: noteData.content,
        color: noteData.color,
        width: "auto",
        x: noteData.x + 20, // 少しずらして配置
        y: noteData.y + 20,
        userId: user.uid,
        createdAt: Date.now(),
        zIndex: currentZIndex,
        isDragging: false,
        draggedBy: null,
        isEditing: false,
        editedBy: null,
      };

      const noteRef = ref(rtdb, `boards/${boardId}/notes/${noteId}`);
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
        userId: user.uid,
      });
    }

    setNextZIndex(currentZIndex);

    // 新しく作成された付箋を選択状態にする
    const newNoteIds = new Set(createdNotes.map((note) => note.id));
    setSelectedNoteIds(newNoteIds);
  };

  const pasteNote = () => {
    // 未ログインユーザーは付箋を貼り付けできない
    if (!user?.uid) return;

    if (copiedNote) {
      // Remove id and other properties that should be unique
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { id, ...noteData } = copiedNote;

      const newNote: Omit<Note, "id"> = {
        ...noteData,
        type: "note",
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
          type: "CREATE_NOTES",
          noteId: noteId,
          notes: [{ ...newNote, id: noteId }],
          userId: user.uid,
        });
      }

      const noteRef = ref(rtdb, `boards/${boardId}/notes/${noteId}`);
      set(noteRef, newNote);
      setNextZIndex((prev) => prev + 1);

      // 作成された付箋を選択状態にする
      setSelectedNoteIds(new Set([noteId]));
    }
  };

  // Undo/Redo functions
  const performUndo = useCallback(async () => {
    // 未ログインユーザーはundo/redoできない
    if (!user?.uid) return;

    const action = undo();
    if (!action) {
      return;
    }
    if (action.userId !== user.uid) {
      return;
    }

    setIsUndoRedoOperation(true);
    setCurrentUndoRedoNoteId(action.noteId || null);

    try {
      const noteRef = action.noteId
        ? ref(rtdb, `boards/${boardId}/notes/${action.noteId}`)
        : null;
      const note = action.noteId
        ? notes.find((n) => n.id === action.noteId)
        : null;

      switch (action.type) {
        case "CREATE_NOTES":
          if (action.notes) {
            action.notes.forEach((note) => {
              const createNoteRef = ref(
                rtdb,
                `boards/${boardId}/notes/${note.id}`
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
                `boards/${boardId}/notes/${note.id}`
              );
              set(deleteNoteRef, note);
            });
          }
          break;

        case "MOVE_NOTES":
          if (action.moves) {
            for (const { noteId, oldPosition } of action.moves) {
              const moveNoteRef = ref(
                rtdb,
                `boards/${boardId}/notes/${noteId}`
              );
              const moveNote = notes.find((n) => n.id === noteId);
              try {
                const updatedNote = { ...moveNote, ...oldPosition };
                await set(moveNoteRef, updatedNote);
              } catch (error) {
                console.error("Debug: Error setting note to Firebase:", error);
              }
            }
          }
          break;

        case "EDIT_NOTE":
          if (note && noteRef) {
            await set(noteRef, { ...note, content: action.oldContent });
          }
          break;

        case "CREATE_ARROW":
          // 矢印の作成をundo（削除）
          if (action.arrow) {
            const arrowRef = ref(
              rtdb,
              `boards/${boardId}/arrows/${action.arrow.id}`
            );
            remove(arrowRef);
          }
          break;

        case "DELETE_ARROW":
          // 矢印の削除をundo（復元）
          if (action.arrow) {
            const arrowRef = ref(
              rtdb,
              `boards/${boardId}/arrows/${action.arrow.id}`
            );
            set(arrowRef, action.arrow);
          }
          break;

        case "CREATE_GROUP":
          // グループの作成をundo（削除）
          if (action.group) {
            const groupRef = ref(
              rtdb,
              `boards/${boardId}/groups/${action.group.id}`
            );
            remove(groupRef);
          }
          break;

        case "DELETE_GROUP":
          // グループの削除をundo（復元）
          if (action.group) {
            const groupRef = ref(
              rtdb,
              `boards/${boardId}/groups/${action.group.id}`
            );
            set(groupRef, action.group);
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
    // 未ログインユーザーはundo/redoできない
    if (!user?.uid) return;

    const action = redo();
    if (!action || action.userId !== user.uid) return;

    setIsUndoRedoOperation(true);
    setCurrentUndoRedoNoteId(action.noteId || null);

    try {
      const noteRef = action.noteId
        ? ref(rtdb, `boards/${boardId}/notes/${action.noteId}`)
        : null;
      const note = action.noteId
        ? notes.find((n) => n.id === action.noteId)
        : null;

      switch (action.type) {
        case "CREATE_NOTES":
          if (action.notes) {
            action.notes.forEach((note) => {
              const createNoteRef = ref(
                rtdb,
                `boards/${boardId}/notes/${note.id}`
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
                `boards/${boardId}/notes/${note.id}`
              );
              remove(deleteNoteRef);
            });
          }
          break;

        case "MOVE_NOTES":
          if (action.moves) {
            action.moves.forEach(({ noteId, newPosition }) => {
              const moveNoteRef = ref(
                rtdb,
                `boards/${boardId}/notes/${noteId}`
              );
              const moveNote = notes.find((n) => n.id === noteId);
              if (moveNote) {
                set(moveNoteRef, { ...moveNote, ...newPosition });
              }
            });
          }
          break;

        case "EDIT_NOTE":
          if (note && noteRef) {
            set(noteRef, { ...note, content: action.newContent });
          }
          break;

        case "CREATE_ARROW":
          // 矢印の作成をredo（再作成）
          if (action.arrow) {
            const arrowRef = ref(
              rtdb,
              `boards/${boardId}/arrows/${action.arrow.id}`
            );
            set(arrowRef, action.arrow);
          }
          break;

        case "DELETE_ARROW":
          // 矢印の削除をredo（再削除）
          if (action.arrow) {
            const arrowRef = ref(
              rtdb,
              `boards/${boardId}/arrows/${action.arrow.id}`
            );
            remove(arrowRef);
          }
          break;

        case "CREATE_GROUP":
          // グループの作成をredo（再作成）
          if (action.group) {
            const groupRef = ref(
              rtdb,
              `boards/${boardId}/groups/${action.group.id}`
            );
            set(groupRef, action.group);
          }
          break;

        case "DELETE_GROUP":
          // グループの削除をredo（再削除）
          if (action.group) {
            const groupRef = ref(
              rtdb,
              `boards/${boardId}/groups/${action.group.id}`
            );
            remove(groupRef);
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

  // Helper function to check if an input is focused
  const isInputFocused = useCallback(() => {
    const activeElement = document.activeElement;
    return activeElement && 
      (activeElement.tagName === "TEXTAREA" || activeElement.tagName === "INPUT");
  }, []);

  // Undo handler
  const handleUndoKey = useCallback((e: KeyboardEvent) => {
    if (!isInputFocused()) {
      e.preventDefault();
      performUndo();
    }
  }, [isInputFocused, performUndo]);

  // Redo handler
  const handleRedoKey = useCallback((e: KeyboardEvent) => {
    if (!isInputFocused()) {
      e.preventDefault();
      performRedo();
    }
  }, [isInputFocused, performRedo]);

  // Copy handler
  const handleCopyKey = useCallback(async (e: KeyboardEvent) => {
    if (!isInputFocused() && selectedNoteIds.size > 0) {
      e.preventDefault();

      if (e.shiftKey) {
        await copyNotesComplete();
      } else {
        copyNotesAsData();

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
  }, [isInputFocused, selectedNoteIds, copyNotesComplete, copyNotesAsData, notes, setCopiedNote]);

  // Text to notes creation function
  const createNotesFromText = useCallback(
    (text: string) => {
      // 未ログインユーザーは付箋を作成できない
      if (!user?.uid) return;

      const lines = text
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.length > 0);

      if (lines.length === 0) {
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
      const startX = viewportCenterX - ((cols - 1) * spacing) / 2;
      const startY = viewportCenterY - ((rows - 1) * spacing) / 2;

      const createdNotes: Note[] = [];

      lines.forEach((line, index) => {
        const row = Math.floor(index / cols);
        const col = index % cols;

        const noteX = startX + col * spacing;
        const noteY = startY + row * spacing;

        const noteId = nanoid();
        const newNote: Note = {
          id: noteId,
          type: "note",
          content: line,
          x: noteX,
          y: noteY,
          color: "#ffeb3b",
          userId: user.uid,
          createdAt: Date.now(),
          zIndex: nextZIndex + index,
          width: "auto",
          isDragging: false,
          draggedBy: null,
        };

        createdNotes.push(newNote);

        // Firebaseに保存
        const noteRef = ref(rtdb, `boards/${boardId}/notes/${noteId}`);
        set(noteRef, newNote);
      });

      // 履歴に追加
      if (!isUndoRedoOperation) {
        addToHistory({
          type: "CREATE_NOTES",
          noteId: createdNotes[0].id,
          notes: createdNotes,
          userId: user.uid,
        });
      }

      setNextZIndex((prev) => prev + lines.length);

      // 作成された付箋を選択状態にする
      const newNoteIds = new Set(createdNotes.map((note) => note.id));
      setSelectedNoteIds(newNoteIds);
    },
    [
      panX,
      panY,
      zoom,
      user?.uid,
      boardId,
      nanoid,
      nextZIndex,
      isUndoRedoOperation,
      addToHistory,
      setNextZIndex,
      setSelectedNoteIds
    ]
  );

  // Paste handler
  const handlePasteKey = useCallback(async (e: KeyboardEvent) => {
    if (!isInputFocused()) {
      e.preventDefault();

      if (copiedNotes.length > 0) {
        pasteCopiedNotes();
      } else if (copiedNote) {
        pasteNote();
      } else {
        const text = await navigator.clipboard.readText();
        if (text.trim()) {
          createNotesFromText(text);
        }
      }
    }
  }, [isInputFocused, copiedNotes, copiedNote, pasteCopiedNotes, pasteNote, createNotesFromText]);

  // Select all handler
  const handleSelectAllKey = useCallback((e: KeyboardEvent) => {
    if (!isInputFocused()) {
      e.preventDefault();
      const allNoteIds = new Set(notes.map((note) => note.id));
      setSelectedNoteIds(allNoteIds);
    }
  }, [isInputFocused, notes, setSelectedNoteIds]);

  // New note handler
  const handleNewNoteKey = useCallback((e: KeyboardEvent) => {
    if (!isInputFocused()) {
      e.preventDefault();
      addNote();
    }
  }, [isInputFocused, addNote]);

  // New note with focus handler
  const handleNewNoteWithFocusKey = useCallback((e: KeyboardEvent) => {
    e.preventDefault();
    const newNoteId = addNote();
    setNoteToFocus(newNoteId);
    setSelectedNoteIds(new Set([newNoteId]));
  }, [addNote, setNoteToFocus, setSelectedNoteIds]);

  // Add arrow handler
  const handleAddArrowKey = useCallback((e: KeyboardEvent) => {
    e.preventDefault();
    addArrow();
  }, [addArrow]);

  // Create group handler
  const handleCreateGroupKey = useCallback((e: KeyboardEvent) => {
    if (!isInputFocused() && selectedNoteIds.size >= 2) {
      e.preventDefault();
      createGroup();
    }
  }, [isInputFocused, selectedNoteIds, createGroup]);

  // Key hint mode handler
  const handleKeyHintModeKey = useCallback((e: KeyboardEvent) => {
    if (!isInputFocused()) {
      e.preventDefault();
      const visibleNoteIds = notes.map((note) => note.id);
      const hintKeys = generateHintKeys(visibleNoteIds);
      setNoteHintKeys(hintKeys);
      setIsKeyHintMode(true);
    }
  }, [isInputFocused, notes, generateHintKeys, setNoteHintKeys, setIsKeyHintMode]);

  // Arrow keys handler
  const handleArrowKeys = useCallback((e: KeyboardEvent) => {
    if (!isInputFocused()) {
      e.preventDefault();

      if (e.shiftKey) {
        const panDistance = 50;
        let newPanX = panX;
        let newPanY = panY;

        switch (e.key) {
          case "ArrowUp":
            newPanY += panDistance;
            break;
          case "ArrowDown":
            newPanY -= panDistance;
            break;
          case "ArrowLeft":
            newPanX += panDistance;
            break;
          case "ArrowRight":
            newPanX -= panDistance;
            break;
        }

        setPanX(newPanX);
        setPanY(newPanY);
      } else if (selectedNoteIds.size > 0) {
        const moveDistance = 10;
        let deltaX = 0;
        let deltaY = 0;

        switch (e.key) {
          case "ArrowUp":
            deltaY = -moveDistance;
            break;
          case "ArrowDown":
            deltaY = moveDistance;
            break;
          case "ArrowLeft":
            deltaX = -moveDistance;
            break;
          case "ArrowRight":
            deltaX = moveDistance;
            break;
        }

        selectedNoteIds.forEach((noteId) => {
          const note = notes.find((n) => n.id === noteId);
          if (note) {
            updateNote(noteId, {
              x: note.x + deltaX,
              y: note.y + deltaY,
            });
          }
        });
      } else if (e.key === "ArrowUp" || e.key === "ArrowDown") {
        const zoomFactor = e.key === "ArrowUp" ? 1.1 : 0.9;
        const newZoom = Math.max(0.1, Math.min(5, zoom * zoomFactor));

        const centerX = window.innerWidth / 2;
        const centerY = window.innerHeight / 2;

        const worldCenterX = (centerX - panX) / zoom;
        const worldCenterY = (centerY - panY) / zoom;

        const newPanX = centerX - worldCenterX * newZoom;
        const newPanY = centerY - worldCenterY * newZoom;

        setZoom(newZoom);
        setPanX(newPanX);
        setPanY(newPanY);
      }
    }
  }, [isInputFocused, panX, panY, setPanX, setPanY, selectedNoteIds, notes, updateNote, zoom, setZoom]);

  // Delete handler
  const handleDeleteKey = useCallback((e: KeyboardEvent) => {
    if (!isInputFocused() && 
        (selectedNoteIds.size > 0 || selectedItemIds.size > 0 || selectedGroupIds.size > 0)) {
      e.preventDefault();
      deleteSelectedNotes();
      deleteSelectedArrows();
      deleteSelectedGroups();
    }
  }, [isInputFocused, selectedNoteIds, selectedItemIds, selectedGroupIds, deleteSelectedNotes, deleteSelectedArrows, deleteSelectedGroups]);

  // Key hint mode processing handler
  const handleKeyHintModeProcessing = useCallback((e: KeyboardEvent) => {
    e.preventDefault();
    const pressedKey = e.key.toLowerCase();

    let targetNoteId = null;
    for (const [noteId, hintKey] of noteHintKeys) {
      for (let keyLength = 0; keyLength < 32; keyLength++) {
        if (
          hintKey ===
          pressedKeyHistory.slice(0, keyLength).join("") + pressedKey
        ) {
          targetNoteId = noteId;
          break;
        }
      }
      if (targetNoteId) break;
    }

    if (targetNoteId) {
      setSelectedNoteIds(new Set([targetNoteId]));
      setIsKeyHintMode(false);
      setNoteHintKeys(new Map());
      setPressedKeyHistory([]);
    } else {
      setPressedKeyHistory((prev) => [...prev, pressedKey]);
    }
  }, [noteHintKeys, pressedKeyHistory, setSelectedNoteIds, setIsKeyHintMode, setNoteHintKeys, setPressedKeyHistory]);

  // WASD keys handler
  const handleWASDKeys = useCallback((e: KeyboardEvent) => {
    if (!isInputFocused() && !isKeyHintMode) {
      e.preventDefault();
      
      const panDistance = 50;
      let newPanX = panX;
      let newPanY = panY;

      switch (e.key.toLowerCase()) {
        case "w":
          newPanY += panDistance;
          break;
        case "s":
          newPanY -= panDistance;
          break;
        case "a":
          newPanX += panDistance;
          break;
        case "d":
          newPanX -= panDistance;
          break;
      }

      setPanX(newPanX);
      setPanY(newPanY);
    }
  }, [isInputFocused, isKeyHintMode, panX, panY, setPanX, setPanY]);

  // Escape handler
  const handleEscapeKey = useCallback((e: KeyboardEvent) => {
    if (!isInputFocused()) {
      e.preventDefault();
      if (isKeyHintMode) {
        setIsKeyHintMode(false);
        setNoteHintKeys(new Map());
      } else {
        setSelectedNoteIds(new Set());
        setSelectedItemIds(new Set());
        setSelectedGroupIds(new Set());
      }
    }
  }, [isInputFocused, isKeyHintMode, setIsKeyHintMode, setNoteHintKeys, setSelectedNoteIds, setSelectedItemIds, setSelectedGroupIds]);

  // Enter handler
  const handleEnterKey = useCallback((e: KeyboardEvent) => {
    if (!isInputFocused() && selectedNoteIds.size === 1) {
      e.preventDefault();
      const noteId = Array.from(selectedNoteIds)[0];
      setNoteToFocus(noteId);
    }
  }, [isInputFocused, selectedNoteIds, setNoteToFocus]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = async (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey) {
        if (e.key === "z" && !e.shiftKey) {
          handleUndoKey(e);
        } else if (e.key === "y" || (e.key === "z" && e.shiftKey)) {
          handleRedoKey(e);
        } else if (e.key === "c") {
          await handleCopyKey(e);
        } else if (e.key === "v") {
          await handlePasteKey(e);
        } else if (e.key === "a") {
          handleSelectAllKey(e);
        } else if (e.key === "n") {
          handleNewNoteKey(e);
        } else if (e.key === "j") {
          handleNewNoteWithFocusKey(e);
        } else if (e.key === "k") {
          handleAddArrowKey(e);
        } else if (e.key === "g") {
          handleCreateGroupKey(e);
        } else if (e.key === "u") {
          handleKeyHintModeKey(e);
        }
      } else if (
        e.key === "ArrowUp" ||
        e.key === "ArrowDown" ||
        e.key === "ArrowLeft" ||
        e.key === "ArrowRight"
      ) {
        handleArrowKeys(e);
      } else if (
        (e.key === "Delete" || e.key === "Backspace") &&
        (selectedNoteIds.size > 0 ||
          selectedItemIds.size > 0 ||
          selectedGroupIds.size > 0)
      ) {
        handleDeleteKey(e);
      } else if (isKeyHintMode) {
        handleKeyHintModeProcessing(e);
      } else if ((e.key === "w" || e.key === "W" || e.key === "a" || e.key === "A" || 
                 e.key === "s" || e.key === "S" || e.key === "d" || e.key === "D") && !e.shiftKey) {
        handleWASDKeys(e);
      } else if (e.key === "Escape") {
        handleEscapeKey(e);
      } else if (e.key === "Enter") {
        handleEnterKey(e);
      } else if (e.shiftKey) {
        if (e.key === "G") {
          handleCreateGroupKey(e);
        } else if (e.key === "S") {
          handleKeyHintModeKey(e);
        } else if (e.key === "A") {
          handleAddArrowKey(e);
        } else if (e.key === "C") {
          handleNewNoteWithFocusKey(e);
        }
      }
    };

    // handleKeyUpとhandleBlur削除（WASD用のpressedKeys管理が不要のため）

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [
    handleUndoKey,
    handleRedoKey,
    handleCopyKey,
    handlePasteKey,
    handleSelectAllKey,
    handleNewNoteKey,
    handleNewNoteWithFocusKey,
    handleAddArrowKey,
    handleCreateGroupKey,
    handleKeyHintModeKey,
    handleArrowKeys,
    handleDeleteKey,
    handleKeyHintModeProcessing,
    handleWASDKeys,
    handleEscapeKey,
    handleEnterKey,
    selectedNoteIds,
    selectedItemIds,
    selectedGroupIds,
    isKeyHintMode,
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
        user?.uid &&
        (oldPosition.x !== newPosition.x || oldPosition.y !== newPosition.y)
      ) {
        addToHistory({
          type: "MOVE_NOTES",
          noteId: noteId,
          userId: user.uid,
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


  // Show loading state while resolving slug
  if (slugContext?.loading) {
    return (
      <div style={{ paddingTop: "60px" }}>
        <div className="loading"></div>
      </div>
    );
  }

  // Show loading state while checking access
  if (isCheckingAccess) {
    return (
      <div style={{ paddingTop: "60px" }}>
        <div className="loading"></div>
      </div>
    );
  }


  // Show loading while creating missing board
  if (boardId && !board && !isCheckingAccess && isCreatingMissingBoard) {
    return (
      <div style={{ paddingTop: "60px", padding: "20px", textAlign: "center" }}>
        <div className="loading"></div>
        <p>Creating new board...</p>
      </div>
    );
  }

  // ズームレベルに応じたドットの間隔を計算
  const getDotSpacing = (zoomLevel: number) => {
    if (zoomLevel <= 0.3) return 80; // 大きくズームアウトした時は間隔を広く
    if (zoomLevel <= 0.5) return 40; // 中程度のズームアウト
    if (zoomLevel <= 0.8) return 30; // 軽いズームアウト
    return 20; // 通常時とズームイン時
  };

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
          backgroundImage: `radial-gradient(circle, #aaa ${zoom}px, transparent 1px)`,
          backgroundSize: `${getDotSpacing(zoom) * zoom}px ${
            getDotSpacing(zoom) * zoom
          }px`,
          backgroundPosition: `${panX % (getDotSpacing(zoom) * zoom)}px ${
            panY % (getDotSpacing(zoom) * zoom)
          }px`,
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
              currentUserId={user?.uid || "anonymous"}
              getUserColor={getUserColor}
              isDraggingMultiple={isDraggingMultiple}
              zoom={zoom}
              panX={panX}
              panY={panY}
              onDragEnd={handleNoteDragEnd}
              hasMultipleSelected={selectedNoteIds.size > 1}
              shouldFocus={noteToFocus === note.id}
              onFocused={() => setNoteToFocus(null)}
              board={board!}
              project={project}
              onAddNote={addNote}
              onBlur={() => {
                // 付箋の編集が完了したときに確実にメタデータを更新
                setTimeout(() => {
                  updateBoardMetadata();
                }, 500); // throttleの影響を考慮して少し遅延
              }}
              hintKey={isKeyHintMode ? noteHintKeys.get(note.id) : undefined}
            />
          ))}

          {/* グループを描画 */}
          {groups.map((group) => (
            <Group
              key={group.id}
              group={group}
              notes={notes}
              onSelect={handleSelectGroup}
              isSelected={selectedGroupIds.has(group.id)}
              zoom={zoom}
              onStartGroupDrag={startGroupDrag}
            />
          ))}

          {/* SVGコンテナで矢印を描画 */}
          <svg
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: "100%",
              height: "100%",
              pointerEvents: "none",
              overflow: "visible",
            }}
          >
            <g style={{ pointerEvents: "auto" }}>
              {arrows.map((arrow) => (
                <ArrowSVG
                  key={arrow.id}
                  arrow={arrow}
                  onUpdate={updateArrow}
                  isSelected={selectedItemIds.has(arrow.id)}
                  onSelect={handleSelectArrow}
                  zoom={zoom}
                  notes={notes}
                />
              ))}
            </g>
          </svg>

          <CursorDisplay cursors={cursors} />
          {renderSelectionBox()}
        </div>
      </div>
      {board &&
        checkBoardEditPermission(board, project, user?.uid || null).canEdit && (
          <button
            onClick={() => {
              const newNoteId = addNote();
              setNoteToFocus(newNoteId);
              setSelectedNoteIds(new Set([newNoteId]));
            }}
            className="fab-add-btn"
          >
            <LuPlus />
          </button>
        )}
      {selectedNoteIds.size === 2 && user && (
        <button
          onClick={() => addArrow()}
          className="fab-add-arrow-btn"
          style={{
            position: "fixed",
            bottom: "100px",
            right: "30px",
            width: "56px",
            height: "56px",
            borderRadius: "50%",
            backgroundColor: "#2196F3",
            color: "white",
            border: "none",
            boxShadow: "0 4px 8px rgba(0,0,0,0.2)",
            cursor: "pointer",
            fontSize: "24px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
          }}
        >
          ↗
        </button>
      )}
      {selectedNoteIds.size > 1 && user && (
        <div
          style={{
            position: "fixed",
            bottom: "30px",
            right: "100px",
            display: "flex",
            gap: "12px",
            zIndex: 1000,
          }}
        >
          <button
            onClick={() => createGroup()}
            className="fab-create-group-btn"
            title="Create group from selected notes"
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              padding: "12px 16px",
              borderRadius: "28px",
              backgroundColor: "#9C27B0", // 紫色でグループを表現
              color: "white",
              border: "none",
              fontSize: "14px",
              fontWeight: "500",
              boxShadow: "0 2px 8px rgba(0, 0, 0, 0.2)",
              cursor: "pointer",
              transition: "all 0.2s ease",
            }}
          >
            <span style={{ fontSize: "18px" }}>⬡</span>
            <span>Group</span>
          </button>
          <button
            onClick={createBoardFromSelection}
            className="fab-create-board-btn"
            title="Create new board from selected notes"
            disabled={isCreatingBoard}
            style={{
              position: "static", // CSSのfixedポジションを上書き
            }}
          >
            <MdContentCopy />
            <span>{isCreatingBoard ? "Creating..." : "New Board"}</span>
          </button>
        </div>
      )}
      {/* Cosense Link */}
      {board && project?.cosenseProjectName && (
        <a
          href={`https://scrapbox.io/${encodeURIComponent(
            project.cosenseProjectName
          )}/${encodeURIComponent(board.name)}`}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            position: "fixed",
            top: "40px",
            right: "0px",
            fontSize: "10px",
            color: "#666",
            textDecoration: "none",
            padding: "1px 4px",
            backgroundColor: "rgba(255, 255, 255, 0.3)",
            border: "1px solid #ddd",
            zIndex: 1000,
          }}
          onMouseEnter={(e) => {
            (e.target as HTMLAnchorElement).style.color = "#333";
            (e.target as HTMLAnchorElement).style.backgroundColor =
              "rgba(255, 255, 255, 1)";
          }}
          onMouseLeave={(e) => {
            (e.target as HTMLAnchorElement).style.color = "#666";
            (e.target as HTMLAnchorElement).style.backgroundColor =
              "rgba(255, 255, 255, 0.9)";
          }}
        >
          Open Cosense page
        </a>
      )}
    </div>
  );
}

// Auto-create missing board hook (moved outside component to avoid hooks order issues)
function useAutoCreateBoard(
  boardId: string | undefined,
  board: any,
  isCheckingAccess: boolean,
  user: any,
  projectId: string | null,
  urlBoardName: string | undefined,
  legacyBoardId: string | undefined,
  navigate: any
) {
  const [isCreatingMissingBoard, setIsCreatingMissingBoard] = useState<boolean>(false);

  useEffect(() => {
    const shouldCreateBoard = boardId && !board && !isCheckingAccess && user?.uid && !isCreatingMissingBoard;
    
    if (!shouldCreateBoard) return;
    
    setIsCreatingMissingBoard(true);
    
    const createNewBoard = async () => {
      try {
        // Get current project or find a default project
        const projectsRef = ref(rtdb, 'projects');
        const projectsSnapshot = await get(projectsRef);
        let targetProjectId = projectId;

        if (!targetProjectId && projectsSnapshot.exists()) {
          const projects = projectsSnapshot.val();
          // Find first project where user is a member
          for (const [pid, project] of Object.entries(projects)) {
            const projectData = project as any;
            if (projectData.members && projectData.members[user.uid]) {
              targetProjectId = pid;
              break;
            }
          }
        }

        if (!targetProjectId) {
          console.error("No accessible project found for board creation");
          navigate("/");
          return;
        }

        // Create a new board with the requested ID, using URL board name if available
        let boardName = "Untitled";
        
        if (urlBoardName) {
          // Slug-based route: use the board name from URL
          boardName = decodeURIComponent(urlBoardName);
          console.log(`Slug route - URL board name: "${urlBoardName}" -> decoded: "${boardName}"`);
        } else if (legacyBoardId) {
          // Legacy route: try to use a meaningful name based on board ID or use default
          boardName = "Board";
          console.log(`Legacy route - using default name for board ID: "${legacyBoardId}"`);
        } else {
          console.log("No URL board name found, using default 'Untitled'");
        }
        
        // Ensure the name is unique in the project
        const finalBoardName = await generateUniqueBoardName(targetProjectId, boardName);
        console.log(`Final board name: "${finalBoardName}"`);
        boardName = finalBoardName;
        const boardData = {
          id: boardId,
          name: boardName,
          createdBy: user.uid,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          projectId: targetProjectId,
        };

        const updates: any = {};
        updates[`boards/${boardId}`] = boardData;
        updates[`projectBoards/${targetProjectId}/${boardId}`] = boardData;

        await update(ref(rtdb), updates);
        
        console.log(`Created new board "${boardName}" with ID ${boardId}`);
        // The board will be automatically loaded by the existing listeners
      } catch (error) {
        console.error("Error creating new board:", error);
        navigate("/");
      }
    };

    createNewBoard();
  }, [boardId, board, isCheckingAccess, user?.uid, projectId, isCreatingMissingBoard, navigate, urlBoardName, legacyBoardId]);

  return { isCreatingMissingBoard };
}
