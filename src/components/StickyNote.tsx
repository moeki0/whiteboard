import React, {
  useState,
  useRef,
  useEffect,
  useCallback,
  useMemo,
} from "react";
import TextareaAutosize from "react-textarea-autosize";
import throttle from "lodash.throttle";
import { Note, Board, Project, UserProfile } from "../types";
import { checkBoardEditPermission } from "../utils/permissions";
import { calculateBorderColor } from "../utils/borderColors";
import { getUserProfileByUsername, getUserProfile } from "../utils/userProfile";
import { getBoardInfo } from "../utils/boardInfo";
import { rtdb } from "../config/firebase";
import { ref, get } from "firebase/database";

interface ImageContent {
  type: "image";
  url: string;
  size: number;
  originalUrl: string;
}

interface TextContent {
  type: "text";
  content: string;
}

interface UserIconContent {
  type: "usericon";
  username: string;
  photoURL?: string | null;
  displayName?: string | null;
}

interface InlineImageContent {
  type: "inlineimage";
  url: string;
}

interface BoardThumbnailContent {
  type: "boardthumbnail";
  boardName: string;
  thumbnailUrl: string | null;
}

interface BoardLinkContent {
  type: "boardlink";
  boardName: string;
  boardId: string | null;
}

type ParsedContent =
  | ImageContent
  | TextContent
  | UserIconContent
  | InlineImageContent
  | BoardThumbnailContent
  | BoardLinkContent;

interface StickyNoteProps {
  note: Note;
  onUpdate: (noteId: string, updates: Partial<Note>) => void;
  onDelete: (noteId: string) => void;
  isActive: boolean;
  isSelected: boolean;
  onActivate: (noteId: string, isMultiSelect?: boolean) => void;
  onStartBulkDrag: (
    noteId: string,
    e: React.MouseEvent<HTMLDivElement>
  ) => void;
  currentUserId: string | null;
  getUserColor: (userId: string) => string;
  isDraggingMultiple?: boolean;
  zoom?: number;
  onDragEnd?: (
    noteId: string,
    oldPosition: { x: number; y: number },
    newPosition: { x: number; y: number }
  ) => void;
  hasMultipleSelected?: boolean;
  shouldFocus?: boolean;
  onFocused?: () => void;
  board: Board;
  project: Project | null;
  user?: { displayName: string | null; photoURL: string | null } | null;
}

export function StickyNote({
  note,
  onUpdate,
  onDelete,
  isActive,
  isSelected,
  onActivate,
  onStartBulkDrag,
  currentUserId,
  getUserColor,
  isDraggingMultiple = false,
  zoom = 1,
  onDragEnd,
  hasMultipleSelected = false,
  shouldFocus = false,
  onFocused,
  board,
  project,
}: StickyNoteProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [content, setContent] = useState(note.content);
  const [position, setPosition] = useState({ x: note.x, y: note.y });
  const [isDragging, setIsDragging] = useState(false);
  const [showToolbar, setShowToolbar] = useState(false);
  const [noteColor, setNoteColor] = useState(note.color || "white");
  const [textSize, setTextSize] = useState(note.textSize || "medium");
  const [isHovered, setIsHovered] = useState(false);
  const [userProfiles, setUserProfiles] = useState<
    Map<string, UserProfile | null>
  >(new Map());
  const [currentUserProfile, setCurrentUserProfile] =
    useState<UserProfile | null>(null);
  const [boardThumbnails, setBoardThumbnails] = useState<
    Map<string, string | null>
  >(new Map());
  const [boardLinks, setBoardLinks] = useState<Map<string, string | null>>(
    new Map()
  );
  const [insertCount, setInsertCount] = useState(0);
  const [lastInsertTime, setLastInsertTime] = useState(0);
  const [lastInsertPosition, setLastInsertPosition] = useState<{
    start: number;
    end: number;
  } | null>(null);

  // 権限チェック
  const { canEdit: canEditBoard } = checkBoardEditPermission(
    board,
    project,
    currentUserId
  );
  const isNoteOwner = note.userId === currentUserId;
  const canEditNote = canEditBoard || isNoteOwner;
  const canDeleteNote = canEditBoard || isNoteOwner;
  const canMoveNote = canEditBoard || isNoteOwner;
  const [dimensions] = useState({
    width: 160, // 固定幅に設定
    height: "auto" as const,
  });
  const noteRef = useRef<HTMLDivElement>(null);
  const dragOffset = useRef({ x: 0, y: 0, startX: 0, startY: 0 });
  const contentRef = useRef<HTMLTextAreaElement>(null);

  // throttled update function
  const throttledUpdate = useCallback(
    throttle((noteId: string, updates: Partial<Note>) => {
      onUpdate(noteId, updates);
    }, 50), // 50ms interval (20fps) for snappier updates
    [onUpdate]
  );

  useEffect(() => {
    // 自分が編集中でない場合のみコンテンツを更新
    const shouldUpdateContent = !isEditing;

    if (shouldUpdateContent && note.content !== content) {
      setContent(note.content);
    }

    // 自分がドラッグ中でない場合のみ位置を更新
    const shouldUpdatePosition = !isDragging;
    if (
      shouldUpdatePosition &&
      (position.x !== note.x || position.y !== note.y)
    ) {
      setPosition({ x: note.x, y: note.y });
    }

    // 色とテキストサイズを更新
    if (note.color !== noteColor) {
      setNoteColor(note.color || "white");
    }
    if (note.textSize !== textSize) {
      setTextSize(note.textSize || "medium");
    }

    // 固定幅なので動的な幅調整を削除
  }, [
    note,
    isDragging,
    isEditing,
    currentUserId,
    content,
    noteColor,
    textSize,
  ]);

  // ボードサムネイル取得
  useEffect(() => {
    let isMounted = true; // コンポーネントのマウント状態を追跡

    const loadBoardThumbnails = async () => {
      if (!content || !board.id || !isMounted) return;

      // [name.icon]記法を検出
      const iconMatches = content.matchAll(/\[([^\]]+)\.icon(\*\d+)?\]/g);
      const boardNames = new Set<string>();

      for (const match of iconMatches) {
        boardNames.add(match[1]);
      }

      // [name]記法（リンク用）を検出
      const linkMatches = content.matchAll(/\[([^\]]+)\](?!\.[a-z])/g);
      const linkBoardNames = new Set<string>();

      for (const match of linkMatches) {
        linkBoardNames.add(match[1]);
      }

      if (boardNames.size === 0 && linkBoardNames.size === 0) return;

      // 各ボード名のサムネイルを取得
      for (const boardName of boardNames) {
        if (!isMounted) break; // マウント状態チェック


        // 既にキャッシュされている場合はスキップ
        if (boardThumbnails.has(boardName)) {
          continue;
        }

        try {
          // プロジェクト内の全ボードを取得
          const boardsRef = ref(rtdb, `boards`);
          const boardsSnapshot = await get(boardsRef);

          if (!isMounted) break; // 非同期処理後のマウント状態チェック

          const allBoards = boardsSnapshot.val() || {};

          // 同じプロジェクト内のボードを検索
          const projectBoards = Object.entries(allBoards)
            .filter(
              // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars
              ([_, boardData]: [string, any]) =>
                boardData.projectId === board.projectId
            )
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            .map(([id, boardData]: [string, any]) => ({ ...boardData, id }));

          let foundMatch = false;
          for (const targetBoard of projectBoards) {
            if (!isMounted) break; // ループ中のマウント状態チェック

            // 自分自身のボードも含めて検索するが、getBoardInfoは直接使わずキャッシュから取得
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            let targetBoardInfo: any;
            let boardTitle;

            if (targetBoard.id === board.id) {
              // 自分自身の場合は、現在取得可能な情報から判定
              // getBoardInfoを再帰的に呼ばないよう、基本情報のみ使用
              boardTitle = targetBoard.name || "";
            } else {
              targetBoardInfo = await getBoardInfo(targetBoard.id);

              if (!isMounted) break; // getBoardInfo後のマウント状態チェック

              boardTitle = targetBoardInfo.title || targetBoard.name || "";
            }

            if (boardTitle.toLowerCase() === boardName.toLowerCase()) {
              // サムネイル用のボードでもリンク用のIDを保存
              if (isMounted) {
                setBoardLinks(
                  (prev) => new Map(prev.set(boardName, targetBoard.id))
                );
              }

              // 自分自身の場合は現在のボードのサムネイル取得を試行
              if (targetBoard.id === board.id) {
                // 現在のボードのサムネイルはboardInfoから直接取得
                try {
                  const currentBoardInfo = await getBoardInfo(board.id);

                  if (!isMounted) break; // getBoardInfo後のマウント状態チェック

                  setBoardThumbnails(
                    (prev) =>
                      new Map(
                        prev.set(boardName, currentBoardInfo.thumbnailUrl)
                      )
                  );
                } catch (error) {
                  if (isMounted) {
                    setBoardThumbnails(
                      (prev) => new Map(prev.set(boardName, null))
                    );
                  }
                }
              } else {
                try {
                  const otherBoardInfo = await getBoardInfo(targetBoard.id);
                  if (isMounted) {
                    setBoardThumbnails(
                      (prev) =>
                        new Map(prev.set(boardName, otherBoardInfo.thumbnailUrl))
                    );
                  }
                } catch (error) {
                  if (isMounted) {
                    setBoardThumbnails(
                      (prev) => new Map(prev.set(boardName, null))
                    );
                  }
                }
              }
              foundMatch = true;
              break;
            }
          }

          if (!foundMatch && isMounted) {
            setBoardThumbnails((prev) => new Map(prev.set(boardName, null)));
          }
        } catch (error) {
          if (isMounted) {
            console.error(
              `Failed to get board thumbnail for: ${boardName}`,
              error
            );
            setBoardThumbnails((prev) => new Map(prev.set(boardName, null)));
          }
        }
      }

      // 各ボード名のリンクIDを取得
      for (const boardName of linkBoardNames) {
        if (!isMounted) break; // マウント状態チェック

        // 既にキャッシュされている場合はスキップ
        if (boardLinks.has(boardName)) continue;

        try {
          // プロジェクト内の全ボードを取得
          const boardsRef = ref(rtdb, `boards`);
          const boardsSnapshot = await get(boardsRef);

          if (!isMounted) break; // 非同期処理後のマウント状態チェック

          const allBoards = boardsSnapshot.val() || {};

          // 同じプロジェクト内のボードを検索
          const projectBoards = Object.entries(allBoards)
            .filter(
              // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars
              ([_, boardData]: [string, any]) =>
                boardData.projectId === board.projectId
            )
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            .map(([id, boardData]: [string, any]) => ({ ...boardData, id }));

          // ボード名またはタイトルが一致するボードを探す
          let foundMatch = false;
          for (const targetBoard of projectBoards) {
            if (!isMounted) break; // ループ中のマウント状態チェック

            let targetBoardInfo;
            let boardTitle;

            if (targetBoard.id === board.id) {
              // 自分自身の場合は、現在取得可能な情報から判定
              boardTitle = targetBoard.name || "";
            } else {
              targetBoardInfo = await getBoardInfo(targetBoard.id);

              if (!isMounted) break; // getBoardInfo後のマウント状態チェック

              boardTitle = targetBoardInfo.title || targetBoard.name || "";
            }

            if (boardTitle.toLowerCase() === boardName.toLowerCase()) {
              if (isMounted) {
                setBoardLinks(
                  (prev) => new Map(prev.set(boardName, targetBoard.id))
                );
              }
              foundMatch = true;
              break;
            }
          }

          if (!foundMatch && isMounted) {
            setBoardLinks((prev) => new Map(prev.set(boardName, null)));
          }
        } catch (error) {
          if (isMounted) {
            console.error(`Failed to get board link for: ${boardName}`, error);
            setBoardLinks((prev) => new Map(prev.set(boardName, null)));
          }
        }
      }
    };

    loadBoardThumbnails();

    // クリーンアップ関数でマウント状態を更新
    return () => {
      isMounted = false;
    };
  }, [content, board.id, board.projectId]);

  // 初回マウント時にもサムネイル取得を実行
  useEffect(() => {
    let isMounted = true;

    const loadInitialThumbnails = async () => {
      if (!content || !board.id || !isMounted) {
        return;
      }

      // [name.icon]記法を検出
      const iconMatches = content.matchAll(/\[([^\]]+)\.icon(\*\d+)?\]/g);
      const boardNames = new Set<string>();

      for (const match of iconMatches) {
        boardNames.add(match[1]);
      }

      if (boardNames.size === 0) {
        return;
      }
      

      // 各ボード名のサムネイルを取得（キャッシュされていない場合のみ）
      for (const boardName of boardNames) {
        if (!isMounted) break;


        // 既にキャッシュされている場合はスキップ
        if (boardThumbnails.has(boardName)) {
          console.log(`[StickyNote] 初回マウント時: ${boardName}はキャッシュ済み`);
          continue;
        }

        try {
          // 全ボードを取得してフィルタリング（インデックスエラー回避）
          const boardsRef = ref(rtdb, `boards`);
          const boardsSnapshot = await get(boardsRef);

          if (!isMounted) break;

          const allBoards = boardsSnapshot.val() || {};

          // プロジェクト内のボードをフィルタリング
          const boardsArray = Object.entries(allBoards)
            .filter(
              // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars
              ([_, boardData]: [string, any]) =>
                boardData.projectId === board.projectId
            )
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            .map(([id, boardData]: [string, any]) => ({ ...boardData, id }));


          let foundMatch = false;
          for (const targetBoard of boardsArray) {
            if (!isMounted) break;

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            let targetBoardInfo: any;
            let boardTitle;

            if (targetBoard.id === board.id) {
              boardTitle = targetBoard.name || "";
            } else {
              targetBoardInfo = await getBoardInfo(targetBoard.id);
              if (!isMounted) break;
              boardTitle = targetBoardInfo.title || targetBoard.name || "";
            }

            if (boardTitle.toLowerCase() === boardName.toLowerCase()) {
              if (isMounted) {
                setBoardLinks(
                  (prev) => new Map(prev.set(boardName, targetBoard.id))
                );
              }

              if (targetBoard.id === board.id) {
                try {
                  const currentBoardInfo = await getBoardInfo(board.id);
                  if (!isMounted) break;
                  setBoardThumbnails(
                    (prev) =>
                      new Map(
                        prev.set(boardName, currentBoardInfo.thumbnailUrl)
                      )
                  );
                } catch (error) {
                  if (isMounted) {
                    setBoardThumbnails(
                      (prev) => new Map(prev.set(boardName, null))
                    );
                  }
                }
              } else {
                try {
                  const otherBoardInfo = await getBoardInfo(targetBoard.id);
                  if (isMounted) {
                    setBoardThumbnails(
                      (prev) =>
                        new Map(prev.set(boardName, otherBoardInfo.thumbnailUrl))
                    );
                  }
                } catch (error) {
                  if (isMounted) {
                    setBoardThumbnails(
                      (prev) => new Map(prev.set(boardName, null))
                    );
                  }
                }
              }
              foundMatch = true;
              break;
            }
          }

          if (!foundMatch && isMounted) {
            setBoardThumbnails((prev) => new Map(prev.set(boardName, null)));
          }
        } catch (error) {
          if (isMounted) {
            console.error(
              `Failed to get board thumbnail for: ${boardName}`,
              error
            );
            setBoardThumbnails((prev) => new Map(prev.set(boardName, null)));
          }
        }
      }
    };

    loadInitialThumbnails();

    return () => {
      isMounted = false;
    };
  }, []);



  // 固定幅なので自動リサイズは不要

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    // 編集中はドラッグを無効化
    if (isEditing) {
      return;
    }

    // 移動権限がない場合はドラッグを無効化
    if (!canMoveNote) {
      return;
    }

    if (isSelected && hasMultipleSelected) {
      e.preventDefault();
      e.stopPropagation();
      onStartBulkDrag(note.id, e);
      return;
    }

    // 通常の単体ドラッグ
    setIsDragging(true);
    dragOffset.current = {
      x: e.clientX,
      y: e.clientY,
      startX: position.x,
      startY: position.y,
    };
    // ドラッグ開始をFirebaseに通知
    onUpdate(note.id, { isDragging: true, draggedBy: currentUserId });
  };

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (isDragging && !isEditing) {
        // ズームを考慮した移動距離計算
        const deltaX = (e.clientX - dragOffset.current.x) / zoom;
        const deltaY = (e.clientY - dragOffset.current.y) / zoom;
        const newX = dragOffset.current.startX + deltaX;
        const newY = dragOffset.current.startY + deltaY;

        setPosition({ x: newX, y: newY });

        // Lodash throttleを使用したFirebase更新
        throttledUpdate(note.id, {
          x: newX,
          y: newY,
          isDragging: true,
          draggedBy: currentUserId,
        });
      }
    },
    [currentUserId, isDragging, note.id, throttledUpdate, zoom]
  );

  const handleMouseUp = useCallback(() => {
    if (isDragging) {
      setIsDragging(false);

      // ドラッグ完了時に移動履歴を記録
      const startX = dragOffset.current.startX;
      const startY = dragOffset.current.startY;
      if (onDragEnd && (startX !== position.x || startY !== position.y)) {
        onDragEnd(
          note.id,
          { x: startX, y: startY },
          { x: position.x, y: position.y }
        );
      }

      // 最終位置を即座に更新（throttleをバイパス）
      onUpdate(note.id, {
        x: position.x,
        y: position.y,
        isDragging: false,
        draggedBy: null,
      });
    }
  }, [isDragging, note.id, onUpdate, onDragEnd, position.x, position.y]);

  useEffect(() => {
    if (isDragging) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
      return () => {
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
      };
    }
  }, [handleMouseMove, handleMouseUp, isDragging, position]);

  // throttled content update function
  const throttledContentUpdate = useCallback(
    throttle((noteId: string, updates: Partial<Note>) => {
      onUpdate(noteId, updates);
    }, 300), // 300ms interval for text updates
    [onUpdate]
  );

  const handleContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newContent = e.target.value;
    setContent(newContent);

    // 固定幅なので幅の計算は不要、コンテンツのみ更新
    throttledContentUpdate(note.id, {
      content: newContent,
      width: dimensions.width,
      isEditing: true,
      editedBy: currentUserId,
    });
  };

  const handleBlur = () => {
    setIsEditing(false);
    setShowToolbar(false);
    onUpdate(note.id, {
      content,
      width: dimensions.width,
      isEditing: false,
      editedBy: null,
    });
  };

  // URLかどうかをチェック
  const isUrl = (text: string) => {
    try {
      new URL(text.trim());
      return true;
    } catch {
      return false;
    }
  };

  // GyazoのURLかどうかをチェック
  const isGyazoUrl = (text: string) => {
    return /https:\/\/gyazo\.com\/[a-zA-Z0-9]+(\/(max_size|raw)\/\d+)?/.test(
      text.trim()
    );
  };

  // GyazoのURLから画像URLを取得
  const getGyazoImageUrl = (url: string): string | null => {
    const match = url.match(/https:\/\/gyazo\.com\/([a-zA-Z0-9]+)/);
    if (!match) return null;

    const id = match[1];

    // max_sizeパラメータがある場合はそれを使用
    const maxSizeMatch = url.match(/\/max_size\/(\d+)/);
    if (maxSizeMatch) {
      const maxSize = maxSizeMatch[1];
      return `https://gyazo.com/${id}/max_size/${maxSize}`;
    }

    // rawパラメータがある場合はそれを使用
    const rawMatch = url.match(/\/raw\/(\d+)/);
    if (rawMatch) {
      const rawSize = rawMatch[1];
      return `https://gyazo.com/${id}/raw/${rawSize}`;
    }

    // 通常の場合はmax_size/1000を使用（JPG、PNG、GIF全対応）
    return `https://gyazo.com/${id}/max_size/1000`;
  };

  // アスタリスクの数から画像サイズを計算（#との組み合わせにも対応）
  const getImageSize = (line: string) => {
    const baseSize = 50;
    let sizeMultiplier = 1;

    // *のみをチェック
    const asteriskOnlyMatch = line.match(/^(\*+)(.*)/);

    if (asteriskOnlyMatch) {
      // *のみの場合
      const asteriskCount = asteriskOnlyMatch[1].length;
      sizeMultiplier = Math.max(1, asteriskCount);
    }

    return Math.min(2000, baseSize * sizeMultiplier);
  };

  // 付箋全体がGyazoのURLのみかどうかをチェック
  const isContentOnlyGyazoUrl = (content: string) => {
    const lines = content.split("\n").filter((line) => line.trim() !== "");
    if (lines.length !== 1) return false;

    const line = lines[0].trim();
    const withoutAsterisks = line.replace(/^\*+/, "");
    const trimmedContent = withoutAsterisks.trim();

    // テキストが含まれている場合や、[]で囲まれている場合はテキストとして処理
    if (trimmedContent.includes("[") || trimmedContent.includes("]")) {
      return false;
    }

    // 他の文字が前後にある場合はテキストとして処理
    if (
      line.length >
      trimmedContent.length + (line.length - line.replace(/^\*+/, "").length)
    ) {
      return false;
    }

    return isGyazoUrl(trimmedContent);
  };

  // コンテンツを解析して画像、リンク、テキストを分離
  const parseContent = (text: string): ParsedContent[] => {
    // 付箋全体がGyazoのURLのみの場合は画像として処理
    if (isContentOnlyGyazoUrl(text)) {
      const lines = text.split("\n").filter((line) => line.trim() !== "");
      const line = lines[0].trim();
      const asteriskMatch = line.match(/^(\*+)(.*)/);

      if (asteriskMatch) {
        const contentAfterAsterisks = asteriskMatch[2];
        const imageUrl = getGyazoImageUrl(contentAfterAsterisks);

        if (imageUrl) {
          return [
            {
              type: "image",
              url: imageUrl,
              size: getImageSize(line),
              originalUrl: contentAfterAsterisks,
            },
          ];
        }
      } else {
        const imageUrl = getGyazoImageUrl(line);
        if (imageUrl) {
          return [
            {
              type: "image",
              url: imageUrl,
              size: getImageSize(line),
              originalUrl: line,
            },
          ];
        }
      }
    }

    // それ以外の場合はすべてテキストとしてリンク化処理
    const lines = text.split("\n");
    const result: ParsedContent[] = [];

    for (const line of lines) {
      // まずScrapbox記法を処理
      let processedLine = line.replace(
        /\[([^\]]+)\s+(https?:\/\/[^\s\]]+)\]/g,
        (match, linkText, url) => {
          return `__SCRAPBOX__${linkText}__URL__${url}__SCRAPBOX__`;
        }
      );

      // 次に通常のURLを処理（Scrapbox記法内のURLとインライン画像記法内のURLは除外）
      processedLine = processedLine.replace(
        /(https?:\/\/[^\s\]]+)(?!__SCRAPBOX__)(?![^[]*\])/g,
        (url) => {
          if (isUrl(url)) {
            return `__LINK__${url}__LINK__`;
          }
          return url;
        }
      );

      result.push({
        type: "text",
        content: processedLine,
      });
    }

    // ユーザーアイコン記法 [username.icon] と画像記法 [image:url] を処理
    const finalResult: ParsedContent[] = [];
    for (const item of result) {
      if (item.type === "text") {
        // ボードアイコン、ボードリンク、任意の画像、Gyazo URLのパターンをマッチ
        const combinedPattern =
          /\[([^\]]+)\.icon(?:\*(\d+))?\]|\[([^.\]]+)\](?!\.[a-z])|\[image:([^\]]+)\]|\[([^\]]*https:\/\/gyazo\.com\/[^\]]+)\]/g;
        let lastIndex = 0;
        let match;
        const parts: ParsedContent[] = [];

        while ((match = combinedPattern.exec(item.content)) !== null) {
          // マッチ前のテキストを追加
          if (match.index > lastIndex) {
            parts.push({
              type: "text",
              content: item.content.substring(lastIndex, match.index),
            });
          }

          if (match[1]) {
            // [name.icon]記法をボードサムネイルとして処理
            const name = match[1];
            const count = match[2] ? parseInt(match[2], 10) : 1;

            // 数分だけボードサムネイルを追加
            for (let i = 0; i < count; i++) {
              parts.push({
                type: "boardthumbnail",
                boardName: name,
                thumbnailUrl: null, // レンダリング時に動的に取得
              });
            }
          } else if (match[3]) {
            // [name]記法をボードリンクとして処理
            const name = match[3];
            parts.push({
              type: "boardlink",
              boardName: name,
              boardId: null, // レンダリング時に動的に取得
            });
          } else if (match[4]) {
            // インライン画像を追加
            parts.push({ type: "inlineimage", url: match[4] });
          } else if (match[5]) {
            // Gyazo URLをインライン画像として追加
            const gyazoUrl = match[5];
            const imageUrl = getGyazoImageUrl(gyazoUrl);
            if (imageUrl) {
              parts.push({ type: "inlineimage", url: imageUrl });
            } else {
              parts.push({ type: "text", content: `[${gyazoUrl}]` });
            }
          }

          lastIndex = match.index + match[0].length;
        }

        // 残りのテキストを追加
        if (lastIndex < item.content.length) {
          parts.push({
            type: "text",
            content: item.content.substring(lastIndex),
          });
        }

        if (parts.length > 0) {
          finalResult.push(...parts);
        } else {
          finalResult.push(item);
        }
      } else {
        finalResult.push(item);
      }
    }

    return finalResult;
  };

  // テキスト内のリンクを処理
  const renderTextWithLinks = (text: string) => {
    // 通常のリンクとScrapbox記法の両方を処理
    const parts = text.split(
      /(__LINK__[^_]+__LINK__|__SCRAPBOX__.+?__SCRAPBOX__)/
    );

    return parts.map((part, index) => {
      if (part.startsWith("__LINK__") && part.endsWith("__LINK__")) {
        const url = part.slice(8, -8); // __LINK__を除去
        return (
          <span
            key={index}
            style={{
              color: "#0066cc",
              textDecoration: "underline",
            }}
          >
            {url}
          </span>
        );
      } else if (
        part.startsWith("__SCRAPBOX__") &&
        part.endsWith("__SCRAPBOX__")
      ) {
        const content = part.slice(12, -12);
        const [linkText] = content.split("__URL__");
        return (
          <span
            key={index}
            style={{
              color: "#0066cc",
              textDecoration: "underline",
            }}
          >
            {linkText}
          </span>
        );
      }
      return part;
    });
  };

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    // 一括ドラッグ中はクリックを無視
    if (isDraggingMultiple) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }

    e.stopPropagation();
    const isMultiSelect = e.ctrlKey || e.metaKey || e.shiftKey;
    onActivate(note.id, isMultiSelect);
  };

  const handleDoubleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (isEditing) {
      return;
    }

    e.stopPropagation();

    // 編集権限がある場合
    if (canEditNote) {
      setIsEditing(true);
      setShowToolbar(true);
    } else {
      // 編集権限がない場合は何もしない
      return;
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        !window
          .getSelection()
          ?.focusNode?.parentElement?.classList.contains("sticky-note") &&
        !isEditing &&
        isActive &&
        !hasMultipleSelected &&
        (e.key === "Delete" || e.key === "Backspace") &&
        canDeleteNote
      ) {
        onDelete(note.id);
      }
    };

    if (isActive) {
      document.addEventListener("keydown", handleKeyDown);
      return () => {
        document.removeEventListener("keydown", handleKeyDown);
      };
    }
  }, [isActive, note.id, onDelete, hasMultipleSelected, canDeleteNote]);

  // shouldFocusがtrueの場合、編集モードにしてフォーカスを設定
  useEffect(() => {
    if (shouldFocus && !isEditing && canEditNote) {
      setIsEditing(true);
      setShowToolbar(true);
      // フォーカス完了を通知
      if (onFocused) {
        onFocused();
      }
    }
  }, [shouldFocus, isEditing, onFocused, canEditNote]);

  // ユーザープロファイルを取得する関数（プロジェクトメンバーのみ）
  const loadUserProfile = useCallback(
    async (username: string) => {
      if (userProfiles.has(username)) {
        return;
      }

      try {
        const profile = await getUserProfileByUsername(username);

        // プロジェクトメンバーかどうかをチェック
        let isProjectMember = false;
        if (profile && project && project.members) {
          isProjectMember = !!project.members[profile.uid];
        }

        // プロジェクトメンバーのみをキャッシュに保存
        if (isProjectMember) {
          setUserProfiles((prev) => new Map(prev).set(username, profile));
        } else {
          setUserProfiles((prev) => new Map(prev).set(username, null));
        }
      } catch (error) {
        console.error("Failed to load user profile:", error);
        setUserProfiles((prev) => new Map(prev).set(username, null));
      }
    },
    [userProfiles, project]
  );

  // コンテンツ内のユーザー名を取得してプロファイルをロード
  useEffect(() => {
    const userIconPattern = /\[([^\]*]+)\.icon(?:\*\d+)?\]/g;
    const usernames = new Set<string>();
    let match;

    while ((match = userIconPattern.exec(content)) !== null) {
      usernames.add(match[1]);
    }

    usernames.forEach((username) => {
      loadUserProfile(username);
    });
  }, [content, loadUserProfile]);

  // 現在のユーザープロファイルをロード
  useEffect(() => {
    const loadCurrentUserProfile = async () => {
      if (
        currentUserId &&
        currentUserId !== "anonymous" &&
        !currentUserProfile
      ) {
        try {
          const profile = await getUserProfile(currentUserId);
          setCurrentUserProfile(profile);
        } catch (error) {
          console.error("Failed to load current user profile:", error);
        }
      }
    };

    loadCurrentUserProfile();
  }, [currentUserId, currentUserProfile]);

  // ユーザーアイコン挙入処理
  const handleInsertUserIcon = useCallback(() => {
    if (!currentUserProfile?.username) {
      return;
    }

    const now = Date.now();
    const timeDiff = now - lastInsertTime;

    const textarea = contentRef.current;
    if (!textarea) return;

    // 500ms以内の連打で、直前のアイコンがある場合は書き換え
    let newCount;
    let replaceMode = false;

    if (timeDiff < 500 && lastInsertPosition) {
      // 直前のアイコンを書き換えモード
      newCount = insertCount + 1;
      replaceMode = true;
    } else {
      // 新規挿入モード
      newCount = 1;
      replaceMode = false;
    }

    setInsertCount(newCount);
    setLastInsertTime(now);

    // アイコンテキストを生成
    const iconText =
      newCount === 1
        ? `[${currentUserProfile.username}.icon]`
        : `[${currentUserProfile.username}.icon*${newCount}]`;

    let newContent: string;
    let newCursorPosition: number;

    if (replaceMode && lastInsertPosition) {
      // 直前のアイコンを書き換え
      const beforeReplace = content.substring(0, lastInsertPosition.start);
      const afterReplace = content.substring(lastInsertPosition.end);
      newContent = beforeReplace + iconText + afterReplace;
      newCursorPosition = lastInsertPosition.start + iconText.length;

      // 新しい位置を記録
      setLastInsertPosition({
        start: lastInsertPosition.start,
        end: lastInsertPosition.start + iconText.length,
      });
    } else {
      // 新規挿入
      const cursorPosition = textarea.selectionStart;
      const beforeCursor = content.substring(0, cursorPosition);
      const afterCursor = content.substring(cursorPosition);
      newContent = beforeCursor + iconText + afterCursor;
      newCursorPosition = cursorPosition + iconText.length;

      // 挿入位置を記録
      setLastInsertPosition({
        start: cursorPosition,
        end: cursorPosition + iconText.length,
      });
    }

    setContent(newContent);

    // カーソル位置を設定
    setTimeout(() => {
      textarea.setSelectionRange(newCursorPosition, newCursorPosition);
      textarea.focus();
    }, 0);
  }, [
    currentUserProfile,
    content,
    insertCount,
    lastInsertTime,
    lastInsertPosition,
  ]);

  // Get border color if someone else is interacting with this note
  const getInteractionBorderColor = () => {
    // Check if someone else is dragging this note
    if (note.isDragging && note.draggedBy && note.draggedBy !== currentUserId) {
      return getUserColor ? getUserColor(note.draggedBy) : "#ff4444";
    }
    // Check if someone else is editing this note
    if (note.isEditing && note.editedBy && note.editedBy !== currentUserId) {
      return getUserColor ? getUserColor(note.editedBy) : "#ff4444";
    }
    return null;
  };

  const interactionBorderColor = getInteractionBorderColor();

  // 色選択ハンドラー
  const handleColorSelect = (color: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setNoteColor(color);
    onUpdate(note.id, {
      color,
      isEditing: true,
      editedBy: currentUserId,
    });
    // テキストボックスにフォーカスを戻す
    setTimeout(() => {
      if (contentRef.current) {
        contentRef.current.focus();
      }
    }, 0);
  };

  // 色のスタイルを取得
  const getColorStyle = (color: string) => {
    const colorMap: { [key: string]: string } = {
      white: "#ffffff",
      red: "#ffebee",
      blue: "#e3f2fd",
      green: "#e8f5e9",
      yellow: "#fff9c4",
      purple: "#f3e5f5",
      transparent: "transparent",
    };
    return colorMap[color] || colorMap.white;
  };

  // 文字サイズのスタイルを取得
  const getTextSizeStyle = (size: string) => {
    const sizeMap: { [key: string]: number } = {
      small: 11,
      medium: 13,
      large: 15,
    };
    return sizeMap[size] || sizeMap.medium;
  };

  const extractLinks = (text: string): string[] => {
    const links: string[] = [];

    const urlRegex = /(https?:\/\/[^\s\]]+)/g;
    const urlMatches = text.match(urlRegex);
    if (urlMatches) {
      links.push(...urlMatches);
    }

    const scrapboxRegex = /\[[^\]]+\s+(https?:\/\/[^\s\]]+)\]/g;
    let match;
    while ((match = scrapboxRegex.exec(text)) !== null) {
      links.push(match[1]);
    }

    return [...new Set(links)];
  };

  const extractBoardLinks = (
    text: string
  ): Array<{ name: string; boardId: string }> => {
    const boardLinksArray: Array<{ name: string; boardId: string }> = [];

    const boardLinkMatches = text.matchAll(/\[([^\]]+)\](?!\.[a-z])/g);
    for (const match of boardLinkMatches) {
      const boardName = match[1];
      const boardId = boardLinks.get(boardName);
      if (boardId) {
        boardLinksArray.push({ name: boardName, boardId });
      }
    }

    const boardIconMatches = text.matchAll(/\[([^\]]+)\.icon\]/g);
    for (const match of boardIconMatches) {
      const boardName = match[1];
      const boardId = boardLinks.get(boardName);
      if (boardId) {
        boardLinksArray.push({ name: boardName, boardId });
      }
    }

    const uniqueLinks = boardLinksArray.filter(
      (link, index, self) =>
        index === self.findIndex((l) => l.boardId === link.boardId)
    );

    return uniqueLinks;
  };

  const parsedContent = useMemo(() => parseContent(content), [content]);

  const backgroundColor = getColorStyle(noteColor);
  const borderColor = calculateBorderColor(backgroundColor);

  return (
    <div
      ref={noteRef}
      data-note-id={note.id}
      className={`sticky-note ${isActive ? "active" : ""} ${
        isSelected ? "selected" : ""
      } ${interactionBorderColor ? "being-used" : ""}`}
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
        backgroundColor: backgroundColor,
        boxShadow:
          noteColor === "transparent" ? "none" : "0 0 10px rgba(0, 0, 0, 0.04)",
        border:
          noteColor === "transparent" ? "none" : `1px solid ${borderColor}`,
        zIndex: note.zIndex || 1,
        opacity: canEditNote ? 1 : 0.8,
        fontSize: `${getTextSizeStyle(textSize)}px`,
        ...(interactionBorderColor && {
          borderColor: interactionBorderColor,
          borderWidth: "1px",
          borderStyle: "solid",
        }),
        ...(!canEditNote && {
          borderColor: "#ccc",
          borderWidth: "1px",
          borderStyle: "dashed",
        }),
      }}
      onMouseDown={handleMouseDown}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* リンクボタン */}
      {isHovered &&
        !isEditing &&
        (extractLinks(content).length > 0 ||
          extractBoardLinks(content).length > 0) && (
          <div
            style={{
              position: "absolute",
              top: "-22px",
              left: "50%",
              transform: "translateX(-50%)",
              display: "flex",
              gap: "4px",
              background: "#444",
              borderRadius: "4px 4px 0 0",
              zIndex: 1000,
              border: "1px solid #ccc",
              borderBottom: "none",
            }}
          >
            {/* 通常のリンク */}
            {extractLinks(content)
              .slice(0, 3)
              .map((link, index) => (
                <button
                  key={`url-${index}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    window.open(link, "_blank", "noopener,noreferrer");
                  }}
                  style={{
                    background: "none",
                    border: "none",
                    fontSize: "11px",
                    cursor: "pointer",
                    whiteSpace: "nowrap",
                    maxWidth: "150px",
                    padding: "4px 8px",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    color: "#eee",
                  }}
                  title={link}
                >
                  {new URL(link).hostname}
                </button>
              ))}
            {/* ボードリンク */}
            {extractBoardLinks(content)
              .slice(0, 3)
              .map((boardLink, index) => {
                return (
                  <button
                    key={`board-${index}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      window.location.href = `/${boardLink.boardId}`;
                    }}
                    style={{
                      background: "none",
                      border: "none",
                      fontSize: "11px",
                      cursor: "pointer",
                      whiteSpace: "nowrap",
                      maxWidth: "150px",
                      padding: "4px 8px",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      color: "#eee",
                    }}
                    title={`Board: ${boardLink.name}`}
                  >
                    {boardLink.name}
                  </button>
                );
              })}
          </div>
        )}
      {/* ツールバー */}
      {showToolbar && isEditing && canEditNote ? (
        <div
          className="note-toolbar"
          role="toolbar"
          aria-label="Color selection"
        >
          {/* 色選択ボタン */}
          <div className="toolbar-section">
            <button
              className="toolbar-color-btn white"
              onClick={(e) => handleColorSelect("white", e)}
              onMouseDown={(e) => e.preventDefault()}
              title="白"
            />
            <button
              className="toolbar-color-btn transparent"
              onClick={(e) => handleColorSelect("transparent", e)}
              onMouseDown={(e) => e.preventDefault()}
              title="透明"
            />
            <button
              className="toolbar-color-btn red"
              onClick={(e) => handleColorSelect("red", e)}
              onMouseDown={(e) => e.preventDefault()}
              title="赤"
            />
            <button
              className="toolbar-color-btn blue"
              onClick={(e) => handleColorSelect("blue", e)}
              onMouseDown={(e) => e.preventDefault()}
              title="青"
            />
            <button
              className="toolbar-color-btn green"
              onClick={(e) => handleColorSelect("green", e)}
              onMouseDown={(e) => e.preventDefault()}
              title="緑"
            />
            <button
              className="toolbar-color-btn yellow"
              onClick={(e) => handleColorSelect("yellow", e)}
              onMouseDown={(e) => e.preventDefault()}
              title="黄"
            />
            <button
              className="toolbar-color-btn purple"
              onClick={(e) => handleColorSelect("purple", e)}
              onMouseDown={(e) => e.preventDefault()}
              title="紫"
            />
          </div>
        </div>
      ) : null}

      <div className="note-content" style={{ position: "relative" }}>
        {isEditing && canEditNote ? (
          <TextareaAutosize
            ref={contentRef}
            value={content}
            onChange={handleContentChange}
            onBlur={handleBlur}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.preventDefault();
                handleBlur();
              } else if (e.key === "i" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                handleInsertUserIcon();
              }
            }}
            autoFocus
            minRows={1}
            maxRows={20}
          />
        ) : (
          <div
            onClick={() => {}}
            style={{
              opacity:
                note.isEditing && note.editedBy !== currentUserId ? 0.6 : 1,
              position: "relative",
            }}
          >
            {!canEditNote && (
              <div
                style={{
                  position: "absolute",
                  top: 0,
                  right: 0,
                  fontSize: "10px",
                  color: "#999",
                  background: "rgba(255, 255, 255, 0.8)",
                  padding: "1px 3px",
                  borderRadius: "2px",
                  zIndex: 1,
                }}
              >
                {currentUserId ? "読み取り専用" : "ログインで編集可能"}
              </div>
            )}
            <div
              style={{
                lineHeight: 1.3,
                overflowWrap: "break-word",
                whiteSpace: "pre-wrap",
                width: parsedContent.find((c) => c.type === "image")
                  ? "auto"
                  : `${dimensions.width}px`,
              }}
            >
              {parsedContent.map((item, index) => {
                if (item.type === "image") {
                  return (
                    <div key={index} style={{ margin: "4px 0" }}>
                      <img
                        src={item.url}
                        alt="Gyazo"
                        style={{
                          width: `${item.size}px`,
                          height: "auto",
                          borderRadius: "4px",
                          userSelect: "none",
                          pointerEvents: "none",
                        }}
                        draggable={false}
                        onMouseDown={(e) => e.preventDefault()}
                      />
                    </div>
                  );
                } else if (item.type === "inlineimage") {
                  // インライン画像の表示
                  return (
                    <img
                      key={index}
                      src={item.url}
                      alt="inline image"
                      style={{
                        width: "1em",
                        height: "1em",
                        verticalAlign: "middle",
                        display: "inline-block",
                      }}
                      onError={(e) => {
                        // 画像が読み込めなかった場合のフォールバック
                        const target = e.target as HTMLImageElement;
                        target.style.display = "none";
                      }}
                    />
                  );
                } else if (item.type === "boardthumbnail") {
                  const thumbnailUrl = boardThumbnails.get(item.boardName);
                  return (
                    <img
                      key={index}
                      src={thumbnailUrl || "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTYiIGhlaWdodD0iMTYiIHZpZXdCb3g9IjAgMCAxNiAxNiIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHJlY3Qgd2lkdGg9IjE2IiBoZWlnaHQ9IjE2IiBmaWxsPSIjZjBmMGYwIiBzdHJva2U9IiNjY2MiLz4KPHN2ZyB3aWR0aD0iMTYiIGhlaWdodD0iMTYiIHZpZXdCb3g9IjAgMCAxNiAxNiIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHBhdGggZD0iTTggNEw2IDEwSDEwTDggNFoiIGZpbGw9IiM5OTkiLz4KPC9zdmc+"}
                      alt={`${item.boardName} thumbnail`}
                      style={{
                        width: "1em",
                        height: "1em",
                        verticalAlign: "middle",
                        display: "inline-block",
                        borderRadius: "2px",
                      }}
                      onError={(e) => {
                        // 画像が読み込めなかった場合のフォールバック
                        const target = e.target as HTMLImageElement;
                        // プレースホルダーSVGに切り替え
                        target.src = "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTYiIGhlaWdodD0iMTYiIHZpZXdCb3g9IjAgMCAxNiAxNiIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHJlY3Qgd2lkdGg9IjE2IiBoZWlnaHQ9IjE2IiBmaWxsPSIjZjBmMGYwIiBzdHJva2U9IiNjY2MiLz4KPHN2ZyB3aWR0aD0iMTYiIGhlaWdodD0iMTYiIHZpZXdCb3g9IjAgMCAxNiAxNiIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHBhdGggZD0iTTggNEw2IDEwSDEwTDggNFoiIGZpbGw9IiM5OTkiLz4KPC9zdmc+";
                      }}
                    />
                  );
                } else if (item.type === "boardlink") {
                  // ボードリンクの表示（クリック不可能なテキスト）
                  const boardId = boardLinks.get(item.boardName);
                  if (boardId) {
                    return (
                      <span
                        key={index}
                        style={{
                          color: "#007acc",
                          textDecoration: "none",
                        }}
                      >
                        {item.boardName}
                      </span>
                    );
                  } else {
                    return (
                      <span key={index} style={{ color: "#666" }}>
                        {item.boardName}
                      </span>
                    );
                  }
                } else if (item.type === "text") {
                  // テキストの場合、アスタリスクや#でフォントサイズを調整
                  let fontSize = 13;
                  let displayContent = item.content;

                  // *のみをチェック
                  const asteriskOnlyMatch = item.content!.match(/^(\*+)(.*)/);

                  if (asteriskOnlyMatch) {
                    // *のみの場合
                    const asteriskCount = asteriskOnlyMatch[1].length;
                    fontSize = Math.min(30, 13 + asteriskCount * 2);
                    displayContent = asteriskOnlyMatch[2];
                  }

                  return (
                    <span
                      key={index}
                      style={{
                        whiteSpace: "pre-wrap",
                        wordWrap: "break-word",
                        fontSize: `${fontSize}px`,
                      }}
                    >
                      {renderTextWithLinks(displayContent || "")}
                    </span>
                  );
                }
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
