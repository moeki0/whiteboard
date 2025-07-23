import React, {
  useState,
  useEffect,
  useCallback,
  useRef,
  useMemo,
} from "react";
import { useNavigate, useParams, NavigateFunction } from "react-router-dom";
import { useSlugContext } from "../contexts/SlugContext";
import { customAlphabet } from "nanoid";
import { rtdb } from "../config/firebase";
import { ref, onValue, set, remove, get, update } from "firebase/database";
import { LuPlus } from "react-icons/lu";
import { MdContentCopy } from "react-icons/md";
import { StickyNote } from "./StickyNote";
import { StickyNoteCounter } from "./StickyNoteCounter";
import { ArrowSVG } from "./ArrowSVG";
import { CursorDisplay } from "./CursorDisplay";
import { Group } from "./Group";
import { useHistory } from "../hooks/useHistory";
import { useBoard } from "../hooks/useBoard";
import { useCursor } from "../hooks/useCursor";
import { useSelection } from "../hooks/useSelection";
import { useDragAndDrop } from "../hooks/useDragAndDrop";
import { usePanZoom } from "../hooks/usePanZoom";
import { useKeyHints } from "../hooks/useKeyHints";
import { useKeyboardHandlers } from "../hooks/useKeyboardHandlers";
import { getUserColor } from "../utils/colors";
import { saveBoardThumbnail } from "../utils/thumbnailUtils";
import { checkBoardEditPermission } from "../utils/permissions";
import {
  User,
  Note,
  Arrow as ArrowType,
  Group as GroupType,
  Board as BoardType,
  Project,
} from "../types";
import {
  generateNewBoardName,
  generateUniqueBoardName,
} from "../utils/boardNaming";
import { isNoteInSelection } from "../utils/noteUtils";
import { updateBoardViewTime } from "../utils/boardViewHistory";
import { UnreadNoteIndicator } from "./UnreadNoteIndicator";
import { useUnreadNotes } from "../hooks/useUnreadNotes";
import { initializeSessionUnreadNotes, resetSession, addNewNoteToSession } from "../utils/sessionUnreadNotes";
import { isNoteUnread } from "../utils/noteViewHistory";

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
  // 状態管理をカスタムフックに分離
  const selection = useSelection();
  const dragAndDrop = useDragAndDrop();
  const panZoom = usePanZoom();
  const keyHints = useKeyHints();

  // activeNoteIdを削除 - selection.selectedNoteIdsで管理
  const [nextZIndex, setNextZIndex] = useState<number>(100);
  // 現在未使用だがコメントアウトで保持
  // const [copiedNote, setCopiedNote] = useState<Note | null>(null);
  // const [copiedNotes, setCopiedNotes] = useState<Note[]>([]);
  const [sessionId] = useState<string>(() =>
    Math.random().toString(36).substr(2, 9)
  );
  const [isUndoRedoOperation, setIsUndoRedoOperation] =
    useState<boolean>(false);
  const [currentUndoRedoNoteId, setCurrentUndoRedoNoteId] = useState<
    string | null
  >(null);
  const [noteToFocus, setNoteToFocus] = useState<string | null>(null);

  // グループ関連の状態
  const [groups, setGroups] = useState<GroupType[]>([]);
  // 矢印作成関連の状態（削除済み）
  // const [isCreatingArrow, setIsCreatingArrow] = useState<boolean>(false);
  // const [arrowStartPoint, setArrowStartPoint] = useState<{
  //   x: number;
  //   y: number;
  // } | null>(null);

  // 範囲選択用の状態は useSelection に移動

  // 一括移動・グループドラッグ状態は useDragAndDrop に移動

  // パン・ズーム状態は usePanZoom に移動
  // WASD パン用の状態（削除：カクカク移動のため不要）

  // 新しいボード作成の状態
  const [isCreatingBoard, setIsCreatingBoard] = useState<boolean>(false);

  // キーヒント状態は useKeyHints に移動

  const boardRef = useRef<HTMLDivElement>(null);
  const notesContainerRef = useRef<HTMLDivElement>(null);
  const lastMousePos = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  const nanoid = customAlphabet("abcdefghijklmnopqrstuvwxyz0123456789", 21);

  // キーヒント生成用の文字列
  const HINT_CHARS = "asdfghjklqwertyuiopzxcvbnm";

  // キーヒントを生成する関数
  const generateHintKeys = useCallback(
    (noteIds: string[]) => {
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

      keyHints.setNoteHintKeys(hintMap);
      return hintMap;
    },
    [keyHints]
  );

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

  // 未読付箋管理フック
  const { unreadNotes, focusNote, markNoteAsRead } = useUnreadNotes({
    boardId: boardId || '',
    notes,
    user,
    zoom: panZoom.zoom,
    panX: panZoom.panX,
    panY: panZoom.panY,
  });

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
          ([id, group]: [string, unknown]) => ({
            ...(group as object),
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
    panX: panZoom.panX,
    panY: panZoom.panY,
    zoom: panZoom.zoom,
  });

  // ハッシュがない場合の初期位置を設定
  useEffect(() => {
    const hash = window.location.hash.slice(1);
    // ハッシュがある場合は別のeffectで処理するのでスキップ
    if (hash) return;

    // ハッシュがない場合は画面中央を原点に
    if (boardRef.current) {
      const rect = boardRef.current.getBoundingClientRect();
      panZoom.setPanX(rect.width / 2);
      panZoom.setPanY(rect.height / 2);
    }
  }, []);

  // 初期ハッシュ処理（一回のみ実行）
  const initialHashProcessed = useRef(false);

  // boardIdが変更されたときにinitialHashProcessedをリセット
  useEffect(() => {
    initialHashProcessed.current = false;
  }, [boardId]);

  useEffect(() => {
    if (notes.length === 0) return;
    if (initialHashProcessed.current) return;
    if (isCreatingMissingBoard) return; // 新規ボード作成中はスキップ

    const hash = window.location.hash.slice(1);
    console.log("Debug: Initial hash processing:", hash, notes.length);

    if (hash) {
      const note = notes.find((n) => n.id === hash);
      console.log("Debug: Found note for hash:", note);
      console.log("Debug: boardRef.current:", boardRef.current);
      if (note) {
        // 新規ボード作成直後の最初の付箋の場合はパンしない
        // （ボードに付箋が1つしかない場合は新規作成直後と判断）
        if (notes.length === 1) {
          // 選択状態のみ設定し、パンはしない
          selection.setSelectedNoteIds(new Set([hash]));
          console.log("Debug: Skipped initial pan for newly created board");
        } else {
          // 画面の中央に付箋の中心を配置
          const centerX = window.innerWidth / 2;
          const centerY = window.innerHeight / 2;
          // 付箋のサイズを考慮（一般的な付箋サイズ: 幅200px, 高さ150px）
          const noteWidth = 200;
          const noteHeight = 150;
          panZoom.setPanX(centerX - note.x - noteWidth / 2);
          panZoom.setPanY(centerY - note.y - noteHeight / 2);
          selection.setSelectedNoteIds(new Set([hash]));
          console.log("Debug: Applied initial hash processing");
        }
      }
    }

    initialHashProcessed.current = true;
  }, [notes, isCreatingMissingBoard]);

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
    selection.setSelectedNoteIds(new Set());
    selection.setSelectedItemIds(new Set());
    selection.setSelectedGroupIds(new Set());
    updateUrlForNote(null);

    // ボードアクセス時の処理
    if (boardId) {
      // セッションをリセットして新しいセッションを開始
      resetSession();
      
      // ボードの閲覧時刻を更新（次回アクセス時の未読判定用）
      updateBoardViewTime(boardId);
    }
  }, [boardId, updateUrlForNote]);

  // 付箋が読み込まれた時にセッション未読状態を初期化
  useEffect(() => {
    if (boardId && notes.length > 0) {
      initializeSessionUnreadNotes(boardId, notes, isNoteUnread);
    }
  }, [boardId, notes]);

  // WASD パンアニメーション（削除：カクカク移動のため不要）

  // URLハッシュの変更を監視（一時的に無効化してテスト）
  // useEffect(() => {
  //   const handleHashChange = () => {
  //     const hash = window.location.hash.slice(1);
  //     if (hash && notes.length > 0) {
  //       const note = notes.find((n) => n.id === hash);
  //       if (note) {
  //         selection.setSelectedNoteIds(new Set([hash]));
  //       }
  //     }
  //   };

  //   window.addEventListener("hashchange", handleHashChange);
  //   return () => window.removeEventListener("hashchange", handleHashChange);
  // }, [notes]);

  // Calculate maxZIndex using useMemo for performance
  const maxZIndex = useMemo(() => {
    if (notes.length > 0) {
      return Math.max(...notes.map((n) => n.zIndex || 0), 99);
    }
    return 99;
  }, [notes]);

  // Update nextZIndex when maxZIndex changes
  useEffect(() => {
    setNextZIndex(maxZIndex + 1);
  }, [maxZIndex]);

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
      const viewportCenterX =
        -panZoom.panX / panZoom.zoom + window.innerWidth / 2 / panZoom.zoom;
      const viewportCenterY =
        -panZoom.panY / panZoom.zoom + window.innerHeight / 2 / panZoom.zoom;
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
    selection.setSelectedNoteIds(new Set([noteId]));
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

    // 新しい付箋をセッション未読に追加
    addNewNoteToSession(noteId);

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
    const selectedNoteArray = Array.from(selection.selectedNoteIds);
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
    selection.setSelectedNoteIds(new Set());
    // 新しい矢印を選択状態にする
    selection.setSelectedItemIds(new Set([arrowId]));

    return arrowId;
  };

  // グループに付箋を追加する関数
  const addNotesToGroup = (groupId: string, noteIds: string[]): boolean => {
    // 未ログインユーザーは操作できない
    if (!user?.uid) return false;

    // 権限チェック
    if (!board || !checkBoardEditPermission(board, project, user.uid).canEdit) {
      return false;
    }

    const group = groups.find((g) => g.id === groupId);
    if (!group) return false;

    // 既存のnoteIdsと新しいnoteIdsをマージ（重複を除く）
    const updatedNoteIds = [...new Set([...group.noteIds, ...noteIds])];

    // 履歴に追加
    if (!isUndoRedoOperation) {
      addToHistory({
        type: "UPDATE_GROUP",
        userId: user.uid,
        groupId: groupId,
        oldNoteIds: group.noteIds,
        newNoteIds: updatedNoteIds,
      });
    }

    const groupRef = ref(rtdb, `boards/${boardId}/groups/${groupId}`);
    update(groupRef, { noteIds: updatedNoteIds });

    return true;
  };

  // グループ作成関数
  const createGroup = (): string => {
    // 未ログインユーザーはグループを作成できない
    if (!user?.uid) return "";

    // 権限チェック
    if (!board || !checkBoardEditPermission(board, project, user.uid).canEdit) {
      return "";
    }

    const selectedNoteArray = Array.from(selection.selectedNoteIds);
    const selectedGroupArray = Array.from(selection.selectedGroupIds);

    // グループが1つ選択されていて、付箋も選択されている場合は、既存グループに追加
    if (selectedGroupArray.length === 1 && selectedNoteArray.length > 0) {
      const targetGroupId = selectedGroupArray[0];
      if (addNotesToGroup(targetGroupId, selectedNoteArray)) {
        // 付箋の選択をクリア
        selection.setSelectedNoteIds(new Set());
        return targetGroupId;
      }
    }

    // 2つ以上の付箋が選択されている必要がある（新規グループ作成時）
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
    selection.setSelectedNoteIds(new Set());
    // 新しいグループを選択状態にする
    selection.setSelectedGroupIds(new Set([groupId]));

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
    if (selection.selectedItemIds.has(arrowId)) {
      selection.setSelectedItemIds((prev) => {
        const newSet = new Set(prev);
        newSet.delete(arrowId);
        return newSet;
      });
    }
  };

  const updateNote = useCallback(
    (noteId: string, updates: Partial<Note>) => {
      // 未ログインユーザーは付箋を更新できない
      if (!user?.uid) return;

      const noteRef = ref(rtdb, `boards/${boardId}/notes/${noteId}`);
      const note = notes.find((n) => n.id === noteId);
      if (note) {
        // ドラッグ中の場合、グループからの距離をチェック
        if (
          updates.isDragging &&
          updates.x !== undefined &&
          updates.y !== undefined
        ) {
          const DISTANCE_THRESHOLD_LEAVE = 200; // 200px以上離れたらグループから削除
          const DISTANCE_THRESHOLD_JOIN = 100; // 100px以内に近づいたらグループに追加
          const noteX = updates.x; // TypeScriptの型推論のために変数に格納
          const noteY = updates.y;

          // この付箋が属しているグループを探す
          const belongingGroups = groups.filter((group) =>
            group.noteIds.includes(noteId)
          );

          // 既存グループからの離脱チェック
          belongingGroups.forEach((group) => {
            const otherNotes = notes.filter(
              (n) => n.id !== noteId && group.noteIds.includes(n.id)
            );

            if (otherNotes.length === 0) return; // 他に付箋がない場合はスキップ

            // 他のグループメンバーとの最小距離を計算
            let minDistance = Infinity;
            otherNotes.forEach((otherNote) => {
              const distance = Math.sqrt(
                Math.pow(noteX - otherNote.x, 2) +
                  Math.pow(noteY - otherNote.y, 2)
              );
              minDistance = Math.min(minDistance, distance);
            });

            // 閾値を超えたらグループから削除
            if (minDistance > DISTANCE_THRESHOLD_LEAVE) {
              const updatedNoteIds = group.noteIds.filter(
                (id) => id !== noteId
              );

              // 履歴に追加
              if (!isUndoRedoOperation) {
                addToHistory({
                  type: "UPDATE_GROUP",
                  userId: user.uid,
                  groupId: group.id,
                  oldNoteIds: group.noteIds,
                  newNoteIds: updatedNoteIds,
                });
              }

              const groupRef = ref(
                rtdb,
                `boards/${boardId}/groups/${group.id}`
              );

              if (updatedNoteIds.length === 1) {
                // グループに付箋が1つしか残らない場合はグループを削除
                remove(groupRef);
              } else {
                update(groupRef, { noteIds: updatedNoteIds });
              }
            }
          });

          // 所属していないグループへの参加チェック
          const nonBelongingGroups = groups.filter(
            (group) => !group.noteIds.includes(noteId)
          );

          nonBelongingGroups.forEach((group) => {
            const groupNotes = notes.filter((n) =>
              group.noteIds.includes(n.id)
            );

            if (groupNotes.length === 0) return; // グループに付箋がない場合はスキップ

            // グループメンバーとの最小距離を計算
            let minDistance = Infinity;
            groupNotes.forEach((groupNote) => {
              const distance = Math.sqrt(
                Math.pow(noteX - groupNote.x, 2) +
                  Math.pow(noteY - groupNote.y, 2)
              );
              minDistance = Math.min(minDistance, distance);
            });

            // 閾値以内に近づいたらグループに追加
            if (minDistance < DISTANCE_THRESHOLD_JOIN) {
              const updatedNoteIds = [...group.noteIds, noteId];

              // 履歴に追加
              if (!isUndoRedoOperation) {
                addToHistory({
                  type: "UPDATE_GROUP",
                  userId: user.uid,
                  groupId: group.id,
                  oldNoteIds: group.noteIds,
                  newNoteIds: updatedNoteIds,
                });
              }

              const groupRef = ref(
                rtdb,
                `boards/${boardId}/groups/${group.id}`
              );
              update(groupRef, { noteIds: updatedNoteIds });
            }
          });
        }
        // updatedAtを追加（updatedAtが明示的に指定された場合のみ）
        const shouldUpdateTimestamp = updates.updatedAt !== undefined;

        console.log("Board updateNote:", {
          noteId,
          updates: JSON.stringify(updates),
          shouldUpdateTimestamp,
          hasUpdatedAtInUpdates: "updatedAt" in updates,
          updatedAtValue: updates.updatedAt,
        });

        const updatedNote = {
          ...note,
          ...updates,
          ...(shouldUpdateTimestamp && {
            updatedAt: updates.updatedAt || Date.now(),
          }),
        };

        console.log("Final updatedNote updatedAt:", updatedNote.updatedAt);

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
    },
    [
      user?.uid,
      boardId,
      notes,
      groups,
      isUndoRedoOperation,
      currentUndoRedoNoteId,
      addToHistory,
    ]
  );

  const deleteNote = (noteId: string) => {
    // 未ログインユーザーは付箋を削除できない
    if (!user?.uid) return;

    const note = notes.find((n) => n.id === noteId);

    // 削除される付箋に接続された矢印を取得
    const relatedArrows = arrows.filter(
      (arrow) => arrow.startNoteId === noteId || arrow.endNoteId === noteId
    );

    // Add to history only if it's user's own note and not undo/redo operation
    if (!isUndoRedoOperation && note && note.userId === user.uid) {
      addToHistory({
        type: "DELETE_NOTES",
        noteId: noteId,
        notes: [note],
        arrows: relatedArrows, // 関連矢印も一緒に記録
        userId: user.uid,
      });
    }

    const noteRef = ref(rtdb, `boards/${boardId}/notes/${noteId}`);
    remove(noteRef);

    // 削除された付箋に接続された矢印を削除（history記録は無効化）
    relatedArrows.forEach((arrow) => {
      const arrowRef = ref(rtdb, `boards/${boardId}/arrows/${arrow.id}`);
      remove(arrowRef);
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
    if (selection.selectedNoteIds.has(noteId)) {
      selection.setSelectedNoteIds((prev) => {
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
    // 一括ドラッグ直後や範囲選択直後はアクティベートを無視（ただし、Shift+クリックは許可）
    if (
      !isShiftSelect &&
      (dragAndDrop.isDraggingMultiple ||
        dragAndDrop.justFinishedBulkDrag ||
        selection.justFinishedSelection)
    ) {
      return;
    }

    if (isMultiSelect && !isShiftSelect) {
      // Ctrl/Cmdキーが押されている場合は最前面に移動
      bringNoteToFront(noteId);
      // 単一選択に設定
      selection.setSelectedNoteIds(new Set([noteId]));
      updateUrlForNote(noteId);
    } else if (isShiftSelect) {
      // Shiftキーが押されている場合は複数選択
      const newSelectedIds = new Set(selection.selectedNoteIds);
      if (newSelectedIds.has(noteId)) {
        newSelectedIds.delete(noteId);
      } else {
        newSelectedIds.add(noteId);
      }
      selection.setSelectedNoteIds(newSelectedIds);
      // 複数選択時はURL更新しない
    } else {
      // 通常の単一選択（zIndexは変更しない）
      selection.setSelectedNoteIds(new Set([noteId]));
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
      const newSelectedIds = new Set(selection.selectedItemIds);
      if (newSelectedIds.has(arrowId)) {
        newSelectedIds.delete(arrowId);
      } else {
        newSelectedIds.add(arrowId);
      }
      selection.setSelectedItemIds(newSelectedIds);
    } else {
      // 通常の単一選択
      selection.setSelectedItemIds(new Set([arrowId]));
      // 付箋の選択をクリア
      selection.setSelectedNoteIds(new Set());
    }
  };

  const handleSelectGroup = (
    groupId: string,
    _isMultiSelect: boolean = false,
    isShiftSelect: boolean = false
  ) => {
    if (isShiftSelect) {
      // Shiftキーが押されている場合は複数選択
      const newSelectedIds = new Set(selection.selectedGroupIds);
      if (newSelectedIds.has(groupId)) {
        newSelectedIds.delete(groupId);
      } else {
        newSelectedIds.add(groupId);
      }
      selection.setSelectedGroupIds(newSelectedIds);
      // Shiftキーの場合は付箋の選択を維持
    } else {
      // 通常の単一選択
      selection.setSelectedGroupIds(new Set([groupId]));
      // 付箋と矢印の選択をクリア
      selection.setSelectedNoteIds(new Set());
      selection.setSelectedItemIds(new Set());
    }
  };

  const handleBoardClick = () => {
    // 範囲選択終了直後や一括ドラッグ終了直後はクリックを無視
    if (
      selection.isSelecting ||
      selection.justFinishedSelection ||
      dragAndDrop.justFinishedBulkDrag
    ) {
      return;
    }

    selection.setSelectedNoteIds(new Set());
    selection.setSelectedItemIds(new Set());
    selection.setSelectedGroupIds(new Set());
    updateUrlForNote(null);
  };

  // 選択された付箋から新しいボードを作成
  const createBoardFromSelection = async () => {
    if (!user || !boardId || !project || isCreatingBoard) return;

    // 選択された付箋を取得
    const selectedNotes = notes.filter((note) =>
      selection.selectedNoteIds.has(note.id)
    );

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

    const clickX = (e.clientX - rect.left - panZoom.panX) / panZoom.zoom;
    const clickY = (e.clientY - rect.top - panZoom.panY) / panZoom.zoom;

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
    selection.setSelectedNoteIds(new Set([newNoteId]));
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
      const x = (e.clientX - rect.left - panZoom.panX) / panZoom.zoom;
      const y = (e.clientY - rect.top - panZoom.panY) / panZoom.zoom;

      selection.setIsSelecting(true);
      selection.setIsMultiSelectMode(false);
      selection.setSelectionStart({ x, y });
      selection.setSelectionEnd({ x, y });
      selection.setJustFinishedSelection(false);

      // 既存の選択をクリア
      selection.setSelectedNoteIds(new Set());
      updateUrlForNote(null);
    } else {
      // 通常のドラッグでパン
      handlePanStart(e);
    }
  };

  // 範囲選択の更新
  const handleBoardMouseMove = useCallback(
    (e: MouseEvent) => {
      // マウス位置を常に記録（ズーム用）
      lastMousePos.current = { x: e.clientX, y: e.clientY };

      if (!selection.isSelecting || !selection.selectionStart) return;

      const rect = boardRef.current?.getBoundingClientRect() || {
        left: 0,
        top: 0,
      };
      // transform を考慮した座標計算
      const x = (e.clientX - rect.left - panZoom.panX) / panZoom.zoom;
      const y = (e.clientY - rect.top - panZoom.panY) / panZoom.zoom;

      selection.setSelectionEnd({ x, y });

      // 選択範囲内の付箋を取得
      const minX = Math.min(selection.selectionStart.x, x);
      const maxX = Math.max(selection.selectionStart.x, x);
      const minY = Math.min(selection.selectionStart.y, y);
      const maxY = Math.max(selection.selectionStart.y, y);

      const notesInSelection = notes.filter((note) => {
        return isNoteInSelection(note, { minX, minY, maxX, maxY });
      });

      // 範囲選択による選択状態を設定
      const newSelectedIds = new Set<string>();

      // マルチセレクトモードの場合は既存の選択を保持
      if (selection.isMultiSelectMode) {
        selection.selectedNoteIds.forEach((id) => newSelectedIds.add(id));
      }

      // 範囲選択された付箋を追加
      notesInSelection.forEach((note) => newSelectedIds.add(note.id));

      selection.setSelectedNoteIds(newSelectedIds);
    },
    [
      selection.isSelecting,
      selection.selectionStart,
      notes,
      selection.isMultiSelectMode,
      selection.selectedNoteIds,
      boardRef,
      panZoom.panX,
      panZoom.panY,
      panZoom.zoom,
    ]
  );

  // 範囲選択の終了
  const handleBoardMouseUp = useCallback(() => {
    if (
      selection.isSelecting &&
      selection.selectionStart &&
      selection.selectionEnd
    ) {
      // 実際にドラッグが行われたかを確認（5px以上の移動で選択とみなす）
      const dragDistance = Math.sqrt(
        Math.pow(selection.selectionEnd.x - selection.selectionStart.x, 2) +
          Math.pow(selection.selectionEnd.y - selection.selectionStart.y, 2)
      );

      const wasActualDrag = dragDistance > 5;

      selection.setIsSelecting(false);
      selection.setSelectionStart(null);
      selection.setSelectionEnd(null);
      selection.setIsMultiSelectMode(false);

      if (wasActualDrag) {
        selection.setJustFinishedSelection(true);
        // 少し後にフラグをクリア
        setTimeout(() => {
          selection.setJustFinishedSelection(false);
        }, 200);
      }
    }
  }, [selection.isSelecting, selection.selectionStart, selection.selectionEnd]);

  // 一括移動の開始
  const startBulkDrag = (
    noteId: string,
    e: React.MouseEvent<HTMLDivElement>
  ) => {
    if (!selection.selectedNoteIds.has(noteId)) {
      return;
    }
    dragAndDrop.setIsDraggingMultiple(true);
    dragAndDrop.setDragStartPos({ x: e.clientX, y: e.clientY });
    dragAndDrop.setJustFinishedBulkDrag(false); // 新しいドラッグ開始時にフラグをクリア

    // 選択された付箋の初期位置を記録
    const positions: Record<string, { x: number; y: number }> = {};
    selection.selectedNoteIds.forEach((id) => {
      const note = notes.find((n) => n.id === id);
      if (note) {
        positions[id] = { x: note.x, y: note.y };
      }
    });
    dragAndDrop.setInitialSelectedPositions(positions);
  };

  // グループドラッグの開始
  const startGroupDrag = (groupId: string, e: React.MouseEvent<SVGElement>) => {
    // 権限チェック
    if (!user?.uid) return;

    const group = groups.find((g) => g.id === groupId);
    if (!group || group.userId !== user.uid) return;

    dragAndDrop.setIsDraggingGroup(true);
    dragAndDrop.setDraggingGroupId(groupId);
    dragAndDrop.setGroupDragStartPos({ x: e.clientX, y: e.clientY });

    // グループ内の付箋の初期位置を記録
    const positions: Record<string, { x: number; y: number }> = {};
    group.noteIds.forEach((noteId) => {
      const note = notes.find((n) => n.id === noteId);
      if (note) {
        positions[noteId] = { x: note.x, y: note.y };
      }
    });
    dragAndDrop.setInitialGroupNotePositions(positions);
  };

  // 一括移動の処理
  const handleBulkDragMove = useCallback(
    (e: MouseEvent) => {
      if (!dragAndDrop.isDraggingMultiple || !dragAndDrop.dragStartPos) return;

      // ズームを考慮した移動距離計算
      const deltaX = (e.clientX - dragAndDrop.dragStartPos.x) / panZoom.zoom;
      const deltaY = (e.clientY - dragAndDrop.dragStartPos.y) / panZoom.zoom;

      selection.selectedNoteIds.forEach((noteId) => {
        const initialPos = dragAndDrop.initialSelectedPositions[noteId];
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
      dragAndDrop.isDraggingMultiple,
      dragAndDrop.dragStartPos,
      selection.selectedNoteIds,
      dragAndDrop.initialSelectedPositions,
      updateNote,
      user?.uid,
      panZoom.zoom,
    ]
  );

  // グループドラッグの処理
  const handleGroupDragMove = useCallback(
    (e: MouseEvent) => {
      if (
        !dragAndDrop.isDraggingGroup ||
        !dragAndDrop.groupDragStartPos ||
        !dragAndDrop.draggingGroupId
      )
        return;

      // ズームを考慮した移動距離計算
      const deltaX =
        (e.clientX - dragAndDrop.groupDragStartPos.x) / panZoom.zoom;
      const deltaY =
        (e.clientY - dragAndDrop.groupDragStartPos.y) / panZoom.zoom;

      const group = groups.find((g) => g.id === dragAndDrop.draggingGroupId);
      if (!group) return;

      group.noteIds.forEach((noteId) => {
        const initialPos = dragAndDrop.initialGroupNotePositions[noteId];
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
      dragAndDrop.isDraggingGroup,
      dragAndDrop.groupDragStartPos,
      dragAndDrop.draggingGroupId,
      dragAndDrop.initialGroupNotePositions,
      groups,
      updateNote,
      user?.uid,
      panZoom.zoom,
    ]
  );

  // 一括移動の終了
  const handleBulkDragEnd = useCallback(() => {
    if (dragAndDrop.isDraggingMultiple && dragAndDrop.dragStartPos) {
      // 移動履歴を記録
      const moves: Array<{
        noteId: string;
        oldPosition: { x: number; y: number };
        newPosition: { x: number; y: number };
      }> = [];

      selection.selectedNoteIds.forEach((noteId) => {
        const note = notes.find((n) => n.id === noteId);
        const initialPos = dragAndDrop.initialSelectedPositions[noteId];
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
      selection.selectedNoteIds.forEach((noteId) => {
        updateNote(noteId, {
          isDragging: false,
          draggedBy: null,
        });
      });

      dragAndDrop.setJustFinishedBulkDrag(true);

      // 一括ドラッグ状態を遅延してクリア（クリックイベントを防ぐため）
      setTimeout(() => {
        dragAndDrop.setIsDraggingMultiple(false);
        dragAndDrop.setDragStartPos(null);
        dragAndDrop.setInitialSelectedPositions({});
      }, 100);

      // さらに後にフラグをクリア
      setTimeout(() => {
        dragAndDrop.setJustFinishedBulkDrag(false);
      }, 300);
    }
  }, [
    dragAndDrop.isDraggingMultiple,
    selection.selectedNoteIds,
    updateNote,
    dragAndDrop.dragStartPos,
    notes,
    dragAndDrop.initialSelectedPositions,
    isUndoRedoOperation,
    addToHistory,
    user?.uid,
  ]);

  // グループドラッグの終了
  const handleGroupDragEnd = useCallback(() => {
    if (
      dragAndDrop.isDraggingGroup &&
      dragAndDrop.groupDragStartPos &&
      dragAndDrop.draggingGroupId
    ) {
      const group = groups.find((g) => g.id === dragAndDrop.draggingGroupId);
      if (!group) return;

      // 移動履歴を記録
      const moves: Array<{
        noteId: string;
        oldPosition: { x: number; y: number };
        newPosition: { x: number; y: number };
      }> = [];

      group.noteIds.forEach((noteId) => {
        const note = notes.find((n) => n.id === noteId);
        const initialPos = dragAndDrop.initialGroupNotePositions[noteId];
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
      dragAndDrop.setIsDraggingGroup(false);
      dragAndDrop.setDraggingGroupId(null);
      dragAndDrop.setGroupDragStartPos(null);
      dragAndDrop.setInitialGroupNotePositions({});
    }
  }, [
    dragAndDrop.isDraggingGroup,
    dragAndDrop.groupDragStartPos,
    dragAndDrop.draggingGroupId,
    groups,
    notes,
    dragAndDrop.initialGroupNotePositions,
    isUndoRedoOperation,
    addToHistory,
    user?.uid,
    updateNote,
  ]);

  // パン操作の開始
  const handlePanStart = (e: React.MouseEvent) => {
    // 付箋や範囲選択が進行中の場合はパンしない
    if (selection.isSelecting || dragAndDrop.isDraggingMultiple) return;

    panZoom.setIsPanning(true);
    panZoom.setPanStartPos({ x: e.clientX, y: e.clientY });
    panZoom.setInitialPan({ x: panZoom.panX, y: panZoom.panY });
  };

  // パン操作の処理
  const handlePanMove = useCallback(
    (e: MouseEvent) => {
      if (!panZoom.isPanning || !panZoom.panStartPos || !panZoom.initialPan)
        return;

      const deltaX = e.clientX - panZoom.panStartPos.x;
      const deltaY = e.clientY - panZoom.panStartPos.y;

      panZoom.setPanX(panZoom.initialPan.x + deltaX);
      panZoom.setPanY(panZoom.initialPan.y + deltaY);
    },
    [panZoom.isPanning, panZoom.panStartPos, panZoom.initialPan]
  );

  // パン操作の終了
  const handlePanEnd = useCallback(() => {
    panZoom.setIsPanning(false);
    panZoom.setPanStartPos(null);
    panZoom.setInitialPan(null);
  }, []);

  // ズーム操作（高感度・慣性付き）
  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      // preventDefaultは既にuseEffectで非passiveリスナーで実行されるため削除

      if (!boardRef.current) return;

      const currentTime = Date.now();
      const timeDelta = currentTime - panZoom.lastWheelTime;

      // ズーム感度を調整（より敏感に）
      const baseSensitivity = 0.005; // 感度を3倍に上げる
      const zoomFactor = Math.pow(1.2, -e.deltaY * baseSensitivity);

      // 速度の計算は不要（未使用変数のため削除）

      panZoom.setLastWheelTime(currentTime);
      // panZoom.setZoomVelocity(velocity); // 慣性を無効化

      // マウス位置を取得
      const rect = boardRef.current.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      // ズームターゲットを設定（慣性無効時は毎回マウス位置を使用）
      const targetX = mouseX;
      const targetY = mouseY;

      // ズーム前のターゲット位置（ワールド座標）
      const worldTargetX = (targetX - panZoom.panX) / panZoom.zoom;
      const worldTargetY = (targetY - panZoom.panY) / panZoom.zoom;

      // 新しいズーム値を計算
      const newZoom = Math.max(0.1, Math.min(5, panZoom.zoom * zoomFactor));

      // ズーム後にターゲット位置が同じ場所を指すようにパンを調整
      const newPanX = targetX - worldTargetX * newZoom;
      const newPanY = targetY - worldTargetY * newZoom;

      panZoom.setZoom(newZoom);
      panZoom.setPanX(newPanX);
      panZoom.setPanY(newPanY);
    },
    [panZoom.zoom, panZoom.panX, panZoom.panY, panZoom.lastWheelTime]
  );

  // ズーム慣性アニメーション（無効化）
  // useEffect(() => {
  //   if (Math.abs(panZoom.zoomVelocity) > 0.001) {
  //     const animate = () => {
  //       panZoom.setZoomVelocity((prevVelocity) => {
  //         const newVelocity = prevVelocity * 0.95; // 減衰率を上げてゆっくりに

  //         if (Math.abs(newVelocity) < 0.001) {
  //           // ズーム終了時にターゲットをクリア
  //           panZoom.setZoomTarget(null);
  //           return 0;
  //         }

  //         // ズームターゲットが設定されていればそれを使用、なければビューポート中心
  //         const targetX = panZoom.zoomTarget?.x || window.innerWidth / 2;
  //         const targetY = panZoom.zoomTarget?.y || window.innerHeight / 2;

  //         panZoom.setZoom((prevZoom) => {
  //           const zoomFactor = Math.pow(1.2, -newVelocity);
  //           const newZoom = Math.max(0.1, Math.min(5, prevZoom * zoomFactor));

  //           // パンも調整
  //           if (boardRef.current) {
  //             panZoom.setPanX((prevPanX) => {
  //               const worldTargetX = (targetX - prevPanX) / prevZoom;
  //               return targetX - worldTargetX * newZoom;
  //             });

  //             panZoom.setPanY((prevPanY) => {
  //               const worldTargetY = (targetY - prevPanY) / prevZoom;
  //               return targetY - worldTargetY * newZoom;
  //             });
  //           }

  //           return newZoom;
  //         });

  //         return newVelocity;
  //       });

  //       panZoom.zoomAnimationRef.current = requestAnimationFrame(animate);
  //     };

  //     panZoom.zoomAnimationRef.current = requestAnimationFrame(animate);

  //     return () => {
  //       if (panZoom.zoomAnimationRef.current) {
  //         cancelAnimationFrame(panZoom.zoomAnimationRef.current);
  //       }
  //     };
  //   }
  // }, [panZoom.zoomVelocity, panZoom.zoomTarget]);

  // タッチイベントハンドラ（スマホ対応）
  const getTouchDistance = useCallback((touches: React.TouchList) => {
    if (touches.length < 2) return null;
    const touch1 = touches[0];
    const touch2 = touches[1];
    return Math.sqrt(
      Math.pow(touch2.clientX - touch1.clientX, 2) +
        Math.pow(touch2.clientY - touch1.clientY, 2)
    );
  }, []);

  const getTouchCenter = useCallback((touches: React.TouchList) => {
    if (touches.length === 0) return null;
    let x = 0;
    let y = 0;
    for (let i = 0; i < touches.length; i++) {
      x += touches[i].clientX;
      y += touches[i].clientY;
    }
    return {
      x: x / touches.length,
      y: y / touches.length,
    };
  }, []);

  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      e.preventDefault();

      if (e.touches.length === 1) {
        // 1本指: パン開始
        if (selection.isSelecting || dragAndDrop.isDraggingMultiple) return;

        const touch = e.touches[0];

        panZoom.setIsPanning(true);
        panZoom.setPanStartPos({ x: touch.clientX, y: touch.clientY });
        panZoom.setInitialPan({ x: panZoom.panX, y: panZoom.panY });
      } else if (e.touches.length === 2) {
        // 2本指: ズーム開始
        panZoom.setIsPanning(false);
        panZoom.setIsZooming(true);

        const distance = getTouchDistance(e.touches);
        const center = getTouchCenter(e.touches);

        panZoom.setLastTouchDistance(distance);
        panZoom.setTouchCenter(center);
      }
    },
    [
      selection.isSelecting,
      dragAndDrop.isDraggingMultiple,
      panZoom,
      getTouchDistance,
      getTouchCenter,
    ]
  );

  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      e.preventDefault();

      if (e.touches.length === 1 && panZoom.isPanning) {
        // 1本指: パン処理
        if (!panZoom.panStartPos || !panZoom.initialPan) return;

        const touch = e.touches[0];
        const deltaX = touch.clientX - panZoom.panStartPos.x;
        const deltaY = touch.clientY - panZoom.panStartPos.y;

        panZoom.setPanX(panZoom.initialPan.x + deltaX);
        panZoom.setPanY(panZoom.initialPan.y + deltaY);
      } else if (e.touches.length === 2 && panZoom.isZooming) {
        // 2本指: ピンチズーム処理
        if (
          !boardRef.current ||
          !panZoom.lastTouchDistance ||
          !panZoom.touchCenter
        )
          return;

        const distance = getTouchDistance(e.touches);
        const center = getTouchCenter(e.touches);

        if (distance && center) {
          // ズーム倍率を計算
          const zoomFactor = distance / panZoom.lastTouchDistance;
          const newZoom = Math.max(0.1, Math.min(5, panZoom.zoom * zoomFactor));

          // ズーム中心の座標変換
          const rect = boardRef.current.getBoundingClientRect();
          const centerX = center.x - rect.left;
          const centerY = center.y - rect.top;

          // ワールド座標でのズーム中心
          const worldCenterX = (centerX - panZoom.panX) / panZoom.zoom;
          const worldCenterY = (centerY - panZoom.panY) / panZoom.zoom;

          // 新しいパン位置を計算
          const newPanX = centerX - worldCenterX * newZoom;
          const newPanY = centerY - worldCenterY * newZoom;

          panZoom.setZoom(newZoom);
          panZoom.setPanX(newPanX);
          panZoom.setPanY(newPanY);
          panZoom.setLastTouchDistance(distance);
          panZoom.setTouchCenter(center);
        }
      }
    },
    [panZoom, boardRef, getTouchDistance, getTouchCenter]
  );

  const handleTouchEnd = useCallback(() => {
    panZoom.setIsPanning(false);
    panZoom.setIsZooming(false);
    panZoom.setPanStartPos(null);
    panZoom.setInitialPan(null);
    panZoom.setLastTouchDistance(null);
    panZoom.setTouchCenter(null);
  }, [panZoom]);

  // マウス位置追跡（常時）
  useEffect(() => {
    const handleGlobalMouseMove = (e: MouseEvent) => {
      lastMousePos.current = { x: e.clientX, y: e.clientY };
    };

    document.addEventListener("mousemove", handleGlobalMouseMove);
    return () => {
      document.removeEventListener("mousemove", handleGlobalMouseMove);
    };
  }, []);

  // 未読付箋フォーカス機能のイベントリスナー
  useEffect(() => {
    const handleFocusNote = (event: any) => {
      const { noteId, zoom, panX, panY } = event.detail;
      
      // パンとズームを適用
      panZoom.setZoom(zoom);
      panZoom.setPanX(panX);
      panZoom.setPanY(panY);
      
      // 付箋を選択状態にし、既読にマーク
      selection.setSelectedNoteIds(new Set([noteId]));
      markNoteAsRead(noteId);
    };

    window.addEventListener('focusNote', handleFocusNote);
    
    return () => {
      window.removeEventListener('focusNote', handleFocusNote);
    };
  }, [panZoom, selection, markNoteAsRead]);

  // マウスイベントのリスナー設定
  useEffect(() => {
    if (selection.isSelecting) {
      document.addEventListener("mousemove", handleBoardMouseMove);
      document.addEventListener("mouseup", handleBoardMouseUp);
      return () => {
        document.removeEventListener("mousemove", handleBoardMouseMove);
        document.removeEventListener("mouseup", handleBoardMouseUp);
      };
    }
  }, [selection.isSelecting, handleBoardMouseMove, handleBoardMouseUp]);

  useEffect(() => {
    if (dragAndDrop.isDraggingMultiple) {
      document.addEventListener("mousemove", handleBulkDragMove);
      document.addEventListener("mouseup", handleBulkDragEnd);
      return () => {
        document.removeEventListener("mousemove", handleBulkDragMove);
        document.removeEventListener("mouseup", handleBulkDragEnd);
      };
    }
  }, [dragAndDrop.isDraggingMultiple, handleBulkDragMove, handleBulkDragEnd]);

  // グループドラッグのイベントリスナー
  useEffect(() => {
    if (dragAndDrop.isDraggingGroup) {
      document.addEventListener("mousemove", handleGroupDragMove);
      document.addEventListener("mouseup", handleGroupDragEnd);
      return () => {
        document.removeEventListener("mousemove", handleGroupDragMove);
        document.removeEventListener("mouseup", handleGroupDragEnd);
      };
    }
  }, [dragAndDrop.isDraggingGroup, handleGroupDragMove, handleGroupDragEnd]);

  // パン操作のイベントリスナー
  useEffect(() => {
    if (panZoom.isPanning) {
      document.addEventListener("mousemove", handlePanMove);
      document.addEventListener("mouseup", handlePanEnd);
      return () => {
        document.removeEventListener("mousemove", handlePanMove);
        document.removeEventListener("mouseup", handlePanEnd);
      };
    }
  }, [panZoom.isPanning, handlePanMove, handlePanEnd]);

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

  // 付箋を画像としてクリップボードにコピー - 現在未使用だがコメントアウトで保持
  /*
  const copyNotesAsImage = async () => {
    if (selection.selectedNoteIds.size === 0) {
      return;
    }

    const noteIds = Array.from(selection.selectedNoteIds);
    if (noteIds.length === 1) {
      await copyStickyNoteToClipboard(noteIds[0]);
    } else {
      await copyMultipleStickyNotesToClipboard(noteIds);
    }
  };
  */

  // 付箋データを内部状態にコピー - 現在未使用だがコメントアウトで保持
  /*
  const copyNotesAsData = () => {
    if (selection.selectedNoteIds.size === 0) {
      return;
    }

    const selectedNotes = notes.filter((note) => selection.selectedNoteIds.has(note.id));
    setCopiedNotes(selectedNotes);
    // 複数選択の場合は単一コピーをクリア
    setCopiedNote(null);
  };
  */

  // 統合されたコピー機能（画像とデータの両方） - 現在未使用だがコメントアウトで保持
  /*
  const copyNotesComplete = async () => {
    if (selection.selectedNoteIds.size === 0) {
      return;
    }

    // 画像としてコピー
    await copyNotesAsImage();

    // データとしても内部状態にコピー
    copyNotesAsData();

    // 単一選択の場合はcopiedNoteも設定（後方互換性のため）
    if (selection.selectedNoteIds.size === 1) {
      const noteId = Array.from(selection.selectedNoteIds)[0];
      const note = notes.find((n) => n.id === noteId);
      if (note) {
        setCopiedNote(note);
      }
    } else {
      // 複数選択の場合は単一コピーをクリア
      setCopiedNote(null);
    }
  };
  */

  // 複数選択された付箋を削除 - 現在未使用だがコメントアウトで保持
  /*
  const deleteSelectedNotes = () => {
    // 未ログインユーザーは付箋を削除できない
    if (!user?.uid) return;

    const notesToDelete: Note[] = [];
    selection.selectedNoteIds.forEach((noteId) => {
      const note = notes.find((n) => n.id === noteId);
      if (note && note.userId === user.uid) {
        notesToDelete.push(note);
      }
    });

    // 削除される付箋に関連する矢印を取得
    const noteIdsToDelete = new Set(notesToDelete.map(note => note.id));
    const relatedArrows = arrows.filter(arrow => 
      noteIdsToDelete.has(arrow.startNoteId) || noteIdsToDelete.has(arrow.endNoteId)
    );

    if (notesToDelete.length > 0 && !isUndoRedoOperation) {
      addToHistory({
        type: "DELETE_NOTES",
        noteId: notesToDelete[0].id, // 代表としてひとつめのIDを使用
        notes: notesToDelete,
        arrows: relatedArrows, // 関連矢印も記録
        userId: user.uid,
      });
    }

    // 実際の削除処理
    notesToDelete.forEach((note) => {
      const noteRef = ref(rtdb, `boards/${boardId}/notes/${note.id}`);
      remove(noteRef);
    });

    // 関連矢印も削除
    relatedArrows.forEach((arrow) => {
      const arrowRef = ref(rtdb, `boards/${boardId}/arrows/${arrow.id}`);
      remove(arrowRef);
    });

    selection.setSelectedNoteIds(new Set());
    updateUrlForNote(null);
  };
  */

  // 複数選択された矢印を削除 - 現在未使用だがコメントアウトで保持
  /*
  const deleteSelectedArrows = () => {
    // 未ログインユーザーは矢印を削除できない
    if (!user?.uid) return;

    selection.selectedItemIds.forEach((arrowId) => {
      const arrow = arrows.find((a) => a.id === arrowId);
      if (arrow && arrow.userId === user.uid) {
        deleteArrow(arrowId);
      }
    });

    selection.setSelectedItemIds(new Set());
  };
  */

  // 複数選択されたグループを削除 - 現在未使用だがコメントアウトで保持
  /*
  const deleteSelectedGroups = () => {
    // 未ログインユーザーはグループを削除できない
    if (!user?.uid) return;

    selection.selectedGroupIds.forEach((groupId) => {
      const group = groups.find((g) => g.id === groupId);
      if (group && group.userId === user.uid) {
        deleteGroup(groupId);
      }
    });

    selection.setSelectedGroupIds(new Set());
  };
  */

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
    if (selection.selectedGroupIds.has(groupId)) {
      selection.setSelectedGroupIds((prev) => {
        const newSet = new Set(prev);
        newSet.delete(groupId);
        return newSet;
      });
    }
  };

  // コピーされた複数付箋を貼り付け - 現在未使用だがコメントアウトで保持
  /*
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
    selection.setSelectedNoteIds(newNoteIds);
  };
  */

  // 現在未使用だがコメントアウトで保持
  /*
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
      selection.setSelectedNoteIds(new Set([noteId]));
    }
  };
  */

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
          // 関連矢印も復元
          if (action.arrows) {
            action.arrows.forEach((arrow) => {
              const deleteArrowRef = ref(
                rtdb,
                `boards/${boardId}/arrows/${arrow.id}`
              );
              set(deleteArrowRef, arrow);
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

        case "UPDATE_GROUP":
          // グループの更新をundo（元のnoteIdsに戻す）
          if (action.groupId && action.oldNoteIds) {
            const groupRef = ref(
              rtdb,
              `boards/${boardId}/groups/${action.groupId}`
            );
            update(groupRef, { noteIds: action.oldNoteIds });
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
          // 関連矢印も削除
          if (action.arrows) {
            action.arrows.forEach((arrow) => {
              const deleteArrowRef = ref(
                rtdb,
                `boards/${boardId}/arrows/${arrow.id}`
              );
              remove(deleteArrowRef);
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

        case "UPDATE_GROUP":
          // グループの更新をredo（新しいnoteIdsに更新）
          if (action.groupId && action.newNoteIds) {
            const groupRef = ref(
              rtdb,
              `boards/${boardId}/groups/${action.groupId}`
            );
            update(groupRef, { noteIds: action.newNoteIds });
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
    return (
      activeElement &&
      (activeElement.tagName === "TEXTAREA" ||
        activeElement.tagName === "INPUT")
    );
  }, []);

  // キーボードハンドラーを初期化
  const keyboardHandlers = useKeyboardHandlers({
    notes,
    selectedNoteIds: selection.selectedNoteIds,
    selectedItemIds: selection.selectedItemIds,
    selectedGroupIds: selection.selectedGroupIds,
    isKeyHintMode: keyHints.isKeyHintMode,
    setIsKeyHintMode: keyHints.setIsKeyHintMode,
    pressedKeyHistory: keyHints.pressedKeyHistory,
    setPressedKeyHistory: keyHints.setPressedKeyHistory,
    noteHintKeys: keyHints.noteHintKeys,
    panX: panZoom.panX,
    setPanX: panZoom.setPanX,
    panY: panZoom.panY,
    setPanY: panZoom.setPanY,
    zoom: panZoom.zoom,
    setZoom: panZoom.setZoom,
    boardRef,
    lastMousePos,
    onUndo: performUndo,
    onRedo: performRedo,
    onCopy: async () => {
      console.log("onCopy function called");
      if (selection.selectedNoteIds.size > 0) {
        const selectedNoteIds = Array.from(selection.selectedNoteIds);
        console.log("Selected note IDs:", selectedNoteIds);
        const selectedNotes = notes.filter((note) =>
          selectedNoteIds.includes(note.id)
        );
        console.log("Selected notes:", selectedNotes);

        // JSONデータとしてクリップボードにコピー
        const copyData = {
          type: "maplap-notes",
          notes: selectedNotes,
        };

        try {
          const jsonString = JSON.stringify(copyData);
          console.log("Copying to clipboard:", jsonString);
          await navigator.clipboard.writeText(jsonString);
          console.log("Copy successful");
        } catch (error) {
          console.error("Failed to copy notes:", error);
        }
      } else {
        console.log("No notes selected for copy");
      }
    },
    onPaste: async () => {
      console.log("onPaste function called");
      try {
        const clipboardText = await navigator.clipboard.readText();
        console.log("Clipboard content:", clipboardText);
        const copyData = JSON.parse(clipboardText);
        console.log("Parsed copy data:", copyData);

        if (copyData.type === "maplap-notes" && Array.isArray(copyData.notes)) {
          console.log("Valid maplap notes data, proceeding with paste");
          // マウス位置をボード座標に変換してペースト
          const pasteX = (lastMousePos.current.x - panZoom.panX) / panZoom.zoom;
          const pasteY = (lastMousePos.current.y - panZoom.panY) / panZoom.zoom;
          console.log("Paste position:", { pasteX, pasteY });

          copyData.notes.forEach((note: Note, index: number) => {
            console.log(`Processing note ${index}:`, note);
            // 権限チェック
            if (
              !user?.uid ||
              !board ||
              !checkBoardEditPermission(board, project, user.uid).canEdit
            ) {
              console.log("Permission check failed:", {
                user: !!user?.uid,
                board: !!board,
                canEdit: board
                  ? checkBoardEditPermission(board, project, user?.uid || null)
                      .canEdit
                  : false,
              });
              return;
            }
            console.log("Permission check passed");

            const offsetX = pasteX + index * 20;
            const offsetY = pasteY + index * 20;
            const noteId = nanoid();
            console.log("Creating note with ID:", noteId, "at position:", {
              offsetX,
              offsetY,
            });

            const newNote: Omit<Note, "id"> = {
              type: "note",
              content: note.content, // 元のコンテンツを直接設定
              x: offsetX,
              y: offsetY,
              color: note.color || "white",
              textSize: note.textSize || "medium",
              userId: user.uid,
              createdAt: Date.now(),
              zIndex: nextZIndex + index,
              width: note.width || "auto",
              isDragging: false,
              draggedBy: null,
            };

            // 履歴に追加
            if (!isUndoRedoOperation) {
              addToHistory({
                type: "CREATE_NOTES",
                noteId: noteId,
                notes: [{ ...newNote, id: noteId }],
                userId: user.uid,
              });
            }

            // Firebase Realtime Databaseに直接保存
            const noteRef = ref(rtdb, `boards/${boardId}/notes/${noteId}`);
            console.log("Saving note to Firebase:", newNote);
            set(noteRef, newNote);
          });

          // zIndexを更新
          setNextZIndex((prev) => prev + copyData.notes.length);
          console.log("Paste operation completed successfully");
        } else {
          console.log("Invalid clipboard data format");
        }
      } catch (error) {
        console.error("Failed to paste notes:", error);
      }
    },
    onSelectAll: () => {
      const allNoteIds = new Set(notes.map((note) => note.id));
      selection.setSelectedNoteIds(allNoteIds);
    },
    onAddNote: addNote,
    onAddNoteWithFocus: () => {
      const noteId = addNote();
      setNoteToFocus(noteId);
    },
    onCreateGroup: () => {
      createGroup();
    },
    onDelete: () => {
      console.log("onDelete called");
      console.log("selectedNoteIds:", selection.selectedNoteIds);
      console.log("selectedItemIds:", selection.selectedItemIds);
      console.log("selectedGroupIds:", selection.selectedGroupIds);

      // 選択された付箋を削除
      const selectedNoteIds = Array.from(selection.selectedNoteIds);
      selectedNoteIds.forEach((noteId) => {
        deleteNote(noteId);
      });

      // 選択された矢印を削除
      const selectedArrowIds = Array.from(selection.selectedItemIds);
      selectedArrowIds.forEach((arrowId) => {
        deleteArrow(arrowId);
      });

      // 選択されたグループを削除
      const selectedGroupIds = Array.from(selection.selectedGroupIds);
      selectedGroupIds.forEach((groupId) => {
        deleteGroup(groupId);
      });

      // 選択状態をクリア
      selection.setSelectedNoteIds(new Set());
      selection.setSelectedItemIds(new Set());
      selection.setSelectedGroupIds(new Set());
    },
    generateHintKeys,
    setNoteToFocus,
    setSelectedNoteIds: selection.setSelectedNoteIds,
    onAddArrow: addArrow,
    onMoveSelectedNotes: (deltaX: number, deltaY: number) => {
      // 選択中の付箋を指定されたデルタ値だけ移動
      selection.selectedNoteIds.forEach((noteId) => {
        const note = notes.find((n) => n.id === noteId);
        if (note) {
          updateNote(noteId, {
            x: note.x + deltaX,
            y: note.y + deltaY,
          });
        }
      });
    },
  });

  // キーボードハンドラーは useKeyboardHandlers フックに移動済み

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = async (e: KeyboardEvent) => {
      console.log(
        "KeyDown event:",
        e.key,
        "shiftKey:",
        e.shiftKey,
        "inputFocused:",
        isInputFocused()
      );
      if (!isInputFocused()) {
        // キーヒントモード処理を最優先
        if (keyboardHandlers.handleKeyHintModeProcessing(e)) {
          return; // キーヒントモード処理が実行された場合は他の処理をスキップ
        }

        // Shift+キーの処理を優先（WASDより前に処理）
        if (e.shiftKey && e.code === "KeyS") {
          console.log("Shift+S detected before handleShiftKeys");
          console.log(
            "Current keyHints.isKeyHintMode:",
            keyHints.isKeyHintMode
          );
        }
        console.log("Calling handleShiftKeys...");
        const shiftResult = keyboardHandlers.handleShiftKeys(e);
        console.log("handleShiftKeys returned:", shiftResult);
        if (shiftResult) {
          console.log("Shift key was handled, returning");
          return; // Shift+キーが処理された場合は他の処理をスキップ
        }
        console.log("Shift key was not handled, continuing...");

        // その他のキーボードショートカット処理
        keyboardHandlers.handleUndoKey(e);
        keyboardHandlers.handleRedoKey(e);
        await keyboardHandlers.handleCopyKey(e);
        await keyboardHandlers.handlePasteKey(e);
        keyboardHandlers.handleSelectAllKey(e);
        keyboardHandlers.handleNewNoteKey(e);
        keyboardHandlers.handleNewNoteWithFocusKey(e);
        keyboardHandlers.handleCreateGroupKey(e);
        keyboardHandlers.handleKeyHintModeKey(e);
        keyboardHandlers.handleArrowKeys(e);
        keyboardHandlers.handleDeleteKey(e);
        if (keyboardHandlers.handleWASDKeys(e)) {
          return; // WASDキーが処理された場合は他の処理をスキップ
        }
        keyboardHandlers.handleEscapeKey(e);
        keyboardHandlers.handleEnterKey(e);
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [keyboardHandlers, isInputFocused]);

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
      <div className="loading-wrapper">
        <div className="loading"></div>
      </div>
    );
  }

  // Show loading state while checking access
  if (isCheckingAccess) {
    return (
      <div className="loading-wrapper">
        <div className="loading"></div>
      </div>
    );
  }

  // Show loading while creating missing board
  if (boardId && !board && !isCheckingAccess && isCreatingMissingBoard) {
    return (
      <div className="creating-board-wrapper">
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
    if (
      !selection.isSelecting ||
      !selection.selectionStart ||
      !selection.selectionEnd
    )
      return null;

    const minX = Math.min(selection.selectionStart.x, selection.selectionEnd.x);
    const minY = Math.min(selection.selectionStart.y, selection.selectionEnd.y);
    const width = Math.abs(
      selection.selectionEnd.x - selection.selectionStart.x
    );
    const height = Math.abs(
      selection.selectionEnd.y - selection.selectionStart.y
    );

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

  // ピン留めハンドラー
  const handleTogglePin = async () => {
    if (!board || !boardId || !user?.uid) return;

    // 権限チェック
    if (!checkBoardEditPermission(board, project, user.uid).canEdit) {
      return;
    }

    try {
      const newPinnedState = !board.isPinned;

      // Update board in Firebase
      const boardRef = ref(rtdb, `boards/${boardId}`);
      await set(boardRef, { ...board, isPinned: newPinnedState });

      // Also update in projectBoards for consistency
      if (board.projectId) {
        const projectBoardRef = ref(
          rtdb,
          `projectBoards/${board.projectId}/${boardId}`
        );
        await set(projectBoardRef, { ...board, isPinned: newPinnedState });
      }
    } catch (error) {
      console.error("Error toggling pin:", error);
      alert("Failed to update pin status");
    }
  };

  // 削除ハンドラー
  const handleDeleteBoard = async () => {
    if (!board || !boardId || !user?.uid) return;

    // 権限チェック
    if (!checkBoardEditPermission(board, project, user.uid).canEdit) {
      return;
    }

    if (
      !window.confirm(
        "Are you sure you want to delete this board? This action cannot be undone."
      )
    ) {
      return;
    }

    try {
      const boardRef = ref(rtdb, `boards/${boardId}`);
      await remove(boardRef);

      // Also remove from projectBoards for consistency
      if (board.projectId) {
        const projectBoardRef = ref(
          rtdb,
          `projectBoards/${board.projectId}/${boardId}`
        );
        await remove(projectBoardRef);
      }

      // Remove board notes and cursors
      const boardNotesRef = ref(rtdb, `boardNotes/${boardId}`);
      const boardCursorsRef = ref(rtdb, `boardCursors/${boardId}`);
      await remove(boardNotesRef);
      await remove(boardCursorsRef);

      navigate("/");
    } catch (error) {
      console.error("Error deleting board:", error);
      alert("Failed to delete board. Please try again.");
    }
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
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        style={{
          overflow: "hidden",
          backgroundImage: `radial-gradient(circle, #aaa ${panZoom.zoom}px, transparent 1px)`,
          backgroundSize: `${getDotSpacing(panZoom.zoom) * panZoom.zoom}px ${
            getDotSpacing(panZoom.zoom) * panZoom.zoom
          }px`,
          backgroundPosition: `${
            panZoom.panX % (getDotSpacing(panZoom.zoom) * panZoom.zoom)
          }px ${panZoom.panY % (getDotSpacing(panZoom.zoom) * panZoom.zoom)}px`,
        }}
      >
        <div
          ref={notesContainerRef}
          className="notes-container"
          style={{
            transform: `translate3d(${panZoom.panX}px, ${panZoom.panY}px, 0) scale(${panZoom.zoom})`,
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
                selection.selectedNoteIds.has(note.id) &&
                selection.selectedNoteIds.size === 1
              }
              isSelected={selection.selectedNoteIds.has(note.id)}
              onActivate={handleActivateNote}
              onStartBulkDrag={startBulkDrag}
              currentUserId={user?.uid || "anonymous"}
              getUserColor={getUserColor}
              isDraggingMultiple={dragAndDrop.isDraggingMultiple}
              zoom={panZoom.zoom}
              panX={panZoom.panX}
              panY={panZoom.panY}
              onDragEnd={handleNoteDragEnd}
              hasMultipleSelected={selection.selectedNoteIds.size > 1}
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
              hintKey={
                keyHints.isKeyHintMode
                  ? keyHints.noteHintKeys.get(note.id)
                  : undefined
              }
            />
          ))}

          {/* グループを描画 */}
          {groups.map((group) => (
            <Group
              key={group.id}
              group={group}
              notes={notes}
              onSelect={handleSelectGroup}
              isSelected={selection.selectedGroupIds.has(group.id)}
              zoom={panZoom.zoom}
              onStartGroupDrag={startGroupDrag}
            />
          ))}

          {/* SVGコンテナで矢印を描画 */}
          <svg className="svg-arrows-container" style={{ overflow: "visible" }}>
            <g className="svg-arrows-group">
              {arrows.map((arrow) => (
                <ArrowSVG
                  key={arrow.id}
                  arrow={arrow}
                  onUpdate={updateArrow}
                  isSelected={selection.selectedItemIds.has(arrow.id)}
                  onSelect={handleSelectArrow}
                  zoom={panZoom.zoom}
                  notes={notes}
                />
              ))}
            </g>
          </svg>

          <CursorDisplay cursors={cursors} projectId={projectId || undefined} />
          {renderSelectionBox()}
          
          {/* 未読付箋インジケーター（ズームアウト時のみ表示） */}
          <UnreadNoteIndicator
            unreadNotes={unreadNotes}
            onFocusNote={focusNote}
            zoom={panZoom.zoom}
          />
        </div>
      </div>
      {board &&
        checkBoardEditPermission(board, project, user?.uid || null).canEdit && (
          <button
            onClick={() => {
              const newNoteId = addNote();
              setNoteToFocus(newNoteId);
              selection.setSelectedNoteIds(new Set([newNoteId]));
            }}
            className="fab-add-btn"
          >
            <LuPlus />
          </button>
        )}
      <div className="group-controls">
        {selection.selectedNoteIds.size === 2 && user && (
          <button onClick={() => addArrow()} className="fab-add-arrow">
            ↗ Arrow
          </button>
        )}
        {(selection.selectedNoteIds.size > 1 ||
          (selection.selectedGroupIds.size === 1 &&
            selection.selectedNoteIds.size > 0)) &&
          user && (
            <>
              <button
                onClick={() => createGroup()}
                className="group-button"
                title={
                  selection.selectedGroupIds.size === 1 &&
                  selection.selectedNoteIds.size > 0
                    ? "Add selected notes to group"
                    : "Create group from selected notes"
                }
              >
                <span className="group-icon">⬡</span>
                <span>Group</span>
              </button>
              <button
                onClick={createBoardFromSelection}
                className="group-button create-board-button"
                title="Create new board from selected notes"
                disabled={isCreatingBoard}
              >
                <MdContentCopy />
                <span>{isCreatingBoard ? "Creating..." : "New Board"}</span>
              </button>
            </>
          )}
      </div>
      {/* Cosense Link */}
      {board && project?.cosenseProjectName && (
        <a
          href={`https://scrapbox.io/${encodeURIComponent(
            project.cosenseProjectName
          )}/${encodeURIComponent(board.name)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="board-link"
        >
          Open Cosense page
        </a>
      )}

      {/* 付箋数カウンター */}
      <StickyNoteCounter
        noteCount={notes.length}
        boardId={boardId || null}
        isPinned={board?.isPinned || false}
        canEdit={
          board && user?.uid
            ? checkBoardEditPermission(board, project, user.uid).canEdit
            : false
        }
        onPin={handleTogglePin}
        onDelete={handleDeleteBoard}
      />
    </div>
  );
}

// Auto-create missing board hook (moved outside component to avoid hooks order issues)
function useAutoCreateBoard(
  boardId: string | undefined,
  board: BoardType | null,
  isCheckingAccess: boolean,
  user: User | null,
  projectId: string | null,
  urlBoardName: string | undefined,
  legacyBoardId: string | undefined,
  navigate: NavigateFunction
) {
  const [isCreatingMissingBoard, setIsCreatingMissingBoard] =
    useState<boolean>(false);

  useEffect(() => {
    const shouldCreateBoard =
      boardId &&
      !board &&
      !isCheckingAccess &&
      user?.uid &&
      !isCreatingMissingBoard;

    if (!shouldCreateBoard) return;

    setIsCreatingMissingBoard(true);

    const createNewBoard = async () => {
      try {
        // Get current project or find a default project
        const projectsRef = ref(rtdb, "projects");
        const projectsSnapshot = await get(projectsRef);
        let targetProjectId = projectId;

        if (!targetProjectId && projectsSnapshot.exists()) {
          const projects = projectsSnapshot.val();
          // Find first project where user is a member
          for (const [pid, project] of Object.entries(projects)) {
            const projectData = project as Project;
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
          console.log(
            `Slug route - URL board name: "${urlBoardName}" -> decoded: "${boardName}"`
          );
        } else if (legacyBoardId) {
          // Legacy route: try to use a meaningful name based on board ID or use default
          boardName = "Board";
          console.log(
            `Legacy route - using default name for board ID: "${legacyBoardId}"`
          );
        } else {
          console.log("No URL board name found, using default 'Untitled'");
        }

        // Ensure the name is unique in the project
        const finalBoardName = await generateUniqueBoardName(
          targetProjectId,
          boardName
        );
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

        const updates: Record<string, unknown> = {};
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
  }, [
    boardId,
    board,
    isCheckingAccess,
    user?.uid,
    projectId,
    isCreatingMissingBoard,
    navigate,
    urlBoardName,
    legacyBoardId,
  ]);

  return { isCreatingMissingBoard };
}
