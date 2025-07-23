import React, {
  useState,
  useRef,
  useEffect,
  useCallback,
  useMemo,
} from "react";
import { createPortal } from "react-dom";
import TextareaAutosize from "react-textarea-autosize";
import throttle from "lodash.throttle";
import { Note, Board, Project, UserProfile } from "../types";
import { checkBoardEditPermission } from "../utils/permissions";
import { calculateBorderColor } from "../utils/borderColors";
import { getUserProfileByUsername, getUserProfile } from "../utils/userProfile";
import { getBoardInfo } from "../utils/boardInfo";
import { getBoardIdByTitle } from "../utils/boardTitleIndex";
import { rtdb } from "../config/firebase";
import { ref, get } from "firebase/database";
import { ThumbnailImage } from "./ThumbnailImage";

// グローバルサムネイルキャッシュ（全ての付箋で共有）
const globalThumbnailCache = new Map<string, string | null>();
const thumbnailFetchPromises = new Map<string, Promise<string | null>>();

// ローカルストレージキャッシュの管理
const THUMBNAIL_CACHE_KEY = 'boardThumbnailCache';
const CACHE_EXPIRY_HOURS = 24; // 24時間でキャッシュを無効化

interface CachedThumbnail {
  url: string | null;
  timestamp: number;
}

// ローカルストレージからキャッシュを読み込み
const loadThumbnailCacheFromStorage = (): Map<string, string | null> => {
  try {
    const stored = localStorage.getItem(THUMBNAIL_CACHE_KEY);
    if (!stored) return new Map();
    
    const cache: Record<string, CachedThumbnail> = JSON.parse(stored);
    const now = Date.now();
    const expiryTime = CACHE_EXPIRY_HOURS * 60 * 60 * 1000;
    
    const validCache = new Map<string, string | null>();
    
    Object.entries(cache).forEach(([key, value]) => {
      // 期限切れでないもののみ追加
      if (now - value.timestamp < expiryTime) {
        validCache.set(key, value.url);
      }
    });
    
    console.log(`[LocalCache] Loaded ${validCache.size} cached thumbnails from storage`);
    return validCache;
  } catch (error) {
    console.error('[LocalCache] Failed to load cache from storage:', error);
    return new Map();
  }
};

// ローカルストレージにキャッシュを保存
const saveThumbnailCacheToStorage = (cache: Map<string, string | null>) => {
  try {
    const cacheObject: Record<string, CachedThumbnail> = {};
    const now = Date.now();
    
    cache.forEach((url, key) => {
      cacheObject[key] = {
        url,
        timestamp: now
      };
    });
    
    localStorage.setItem(THUMBNAIL_CACHE_KEY, JSON.stringify(cacheObject));
    console.log(`[LocalCache] Saved ${cache.size} thumbnails to storage`);
  } catch (error) {
    console.error('[LocalCache] Failed to save cache to storage:', error);
  }
};

// 起動時にローカルストレージからキャッシュを復元
const initializeCache = () => {
  const storedCache = loadThumbnailCacheFromStorage();
  storedCache.forEach((url, key) => {
    globalThumbnailCache.set(key, url);
  });
};

// 初期化実行
initializeCache();

// デバウンス用のタイマー
let saveTimeout: NodeJS.Timeout | null = null;

// デバウンスされたローカルストレージ保存
const debouncedSaveToStorage = () => {
  if (saveTimeout) {
    clearTimeout(saveTimeout);
  }
  
  saveTimeout = setTimeout(() => {
    saveThumbnailCacheToStorage(globalThumbnailCache);
    saveTimeout = null;
  }, 1000); // 1秒のデバウンス
};

// グローバルキャッシュからサムネイルを取得する関数
const getCachedThumbnail = async (projectId: string, boardName: string): Promise<string | null> => {
  const cacheKey = `${projectId}:${boardName}`;
  
  // キャッシュにある場合は即座に返す
  if (globalThumbnailCache.has(cacheKey)) {
    return globalThumbnailCache.get(cacheKey) || null;
  }
  
  // 既に取得中の場合は同じPromiseを返す（重複リクエスト防止）
  if (thumbnailFetchPromises.has(cacheKey)) {
    return thumbnailFetchPromises.get(cacheKey)!;
  }
  
  // 新規取得
  const fetchPromise = (async (): Promise<string | null> => {
    try {
      console.log(`[GlobalCache] Fetching thumbnail for: ${boardName}`);
      
      // boardTitleIndexからボードIDを取得
      const boardId = await getBoardIdByTitle(projectId, boardName);
      console.log(`[GlobalCache] Board ID for ${boardName}: ${boardId}`);
      
      if (!boardId) {
        globalThumbnailCache.set(cacheKey, null);
        return null;
      }
      
      // 直接ボードデータからmetadata.thumbnailUrlを取得
      const boardRef = ref(rtdb, `boards/${boardId}`);
      const snapshot = await get(boardRef);
      
      if (snapshot.exists()) {
        const boardData = snapshot.val();
        const thumbnailUrl = boardData.metadata?.thumbnailUrl || null;
        console.log(`[GlobalCache] Thumbnail URL for ${boardName}: ${thumbnailUrl}`);
        
        // キャッシュに保存
        globalThumbnailCache.set(cacheKey, thumbnailUrl);
        
        // デバウンスしてローカルストレージに保存
        debouncedSaveToStorage();
        
        return thumbnailUrl;
      } else {
        console.log(`[GlobalCache] No board data for ${boardName} (ID: ${boardId})`);
        globalThumbnailCache.set(cacheKey, null);
        
        // デバウンスしてローカルストレージに保存
        debouncedSaveToStorage();
        
        return null;
      }
    } catch (error) {
      console.error(`[GlobalCache] Failed to fetch thumbnail for ${boardName}:`, error);
      globalThumbnailCache.set(cacheKey, null);
      
      // デバウンスしてローカルストレージに保存
      debouncedSaveToStorage();
      
      return null;
    } finally {
      // 取得完了後はPromiseキャッシュから削除
      thumbnailFetchPromises.delete(cacheKey);
    }
  })();
  
  // 取得中のPromiseをキャッシュ
  thumbnailFetchPromises.set(cacheKey, fetchPromise);
  return fetchPromise;
};
import {
  handleBracketCompletion,
  analyzeBoardTitleSuggestion,
} from "../utils/textCompletion";
import { useProjectBoards } from "../hooks/useProjectBoards";
import { CombinedSuggestions } from "./BoardSuggestions";
import { useCombinedSuggestions } from "../hooks/useCombinedSuggestions";
import { extractBoardLinks } from "../utils/extractBoardLinks";
import { extractCosenseLinks } from "../utils/extractCosenseLinks";
import { isNoteNewerThanLastView } from "../utils/boardViewHistory";
import { isYouTubeUrl, getYouTubeEmbedUrl } from "../utils/youtubeEmbed";

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

interface BoardThumbnailImageContent {
  type: "boardthumbnailimage";
  boardName: string;
  thumbnailUrl: string | null;
  sizeMultiplier: number;
}

interface YouTubeEmbedContent {
  type: "youtubeembed";
  embedUrl: string;
  originalUrl: string;
  size: { width: number; height: number };
}

interface GoogleDocEmbedContent {
  type: "googledocembed";
  embedUrl: string;
  originalUrl: string;
  size: { width: number; height: number };
}

type ParsedContent =
  | ImageContent
  | TextContent
  | UserIconContent
  | InlineImageContent
  | BoardThumbnailContent
  | BoardLinkContent
  | BoardThumbnailImageContent
  | YouTubeEmbedContent
  | GoogleDocEmbedContent;

interface StickyNoteProps {
  note: Note;
  onUpdate: (noteId: string, updates: Partial<Note>) => void;
  onDelete: (noteId: string) => void;
  isActive: boolean;
  isSelected: boolean;
  onActivate: (
    noteId: string,
    isMultiSelect?: boolean,
    isShiftSelect?: boolean
  ) => void;
  onStartBulkDrag: (
    noteId: string,
    e: React.MouseEvent<HTMLDivElement>
  ) => void;
  currentUserId: string | null;
  getUserColor: (userId: string) => string;
  isDraggingMultiple?: boolean;
  zoom?: number;
  panX?: number;
  panY?: number;
  onDragEnd?: (
    noteId: string,
    oldPosition: { x: number; y: number },
    newPosition: { x: number; y: number }
  ) => void;
  hasMultipleSelected?: boolean;
  onBlur?: () => void;
  shouldFocus?: boolean;
  onFocused?: () => void;
  board: Board;
  project: Project | null;
  user?: { displayName: string | null; photoURL: string | null } | null;
  onAddNote?: (x: number, y: number) => string;
  hintKey?: string;
}

const StickyNoteComponent = function StickyNote({
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
  panX = 0,
  panY = 0,
  onDragEnd,
  hasMultipleSelected = false,
  shouldFocus = false,
  onFocused,
  board,
  project,
  onBlur,
  onAddNote,
  hintKey,
}: StickyNoteProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [content, setContent] = useState(note.content);
  const [position, setPosition] = useState({ x: note.x, y: note.y });
  const [isDragging, setIsDragging] = useState(false);
  const [showToolbar, setShowToolbar] = useState(false);
  const [noteColor, setNoteColor] = useState(note.color || "white");
  const [textSize, setTextSize] = useState(note.textSize || "medium");
  const [isHovered, setIsHovered] = useState(false);

  // ホバー状態の更新を制限するためのデバウンス処理
  const setHoveredDebounced = useMemo(() => {
    let timeoutId: NodeJS.Timeout | null = null;
    return (hovered: boolean) => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      timeoutId = setTimeout(() => {
        setIsHovered(hovered);
      }, 50); // 50ms の遅延でホバー状態を更新
    };
  }, []);
  const [showContextMenu, setShowContextMenu] = useState(false);
  const [contextMenuPosition, setContextMenuPosition] = useState({
    x: 0,
    y: 0,
  });

  // ボード候補関連の状態
  const [showBoardSuggestions, setShowBoardSuggestions] = useState(false);
  const [boardSuggestionInfo, setBoardSuggestionInfo] = useState({
    searchText: "",
    bracketStart: -1,
    bracketEnd: -1,
    position: { x: 0, y: 0 },
  });
  const [, setCursorPosition] = useState(0);
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(0);
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
  
  // 新しいDenormalizedBoard方式のサムネイルキャッシュ
  const [newBoardThumbnails, setNewBoardThumbnails] = useState<Record<string, string | null>>({});
  
  
  const [insertCount, setInsertCount] = useState(0);
  const [lastInsertTime, setLastInsertTime] = useState(0);
  const [lastInsertPosition, setLastInsertPosition] = useState<{
    start: number;
    end: number;
  } | null>(null);
  const [, forceUpdate] = useState({});

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
  // プロジェクトボード一覧を取得
  const { boards: projectBoards } = useProjectBoards(project?.id || null);

  // 統合候補（ボード + Scrapbox）を取得
  const {
    suggestions: combinedSuggestions,
    isLoading: suggestionsLoading,
    error: suggestionsError,
  } = useCombinedSuggestions(
    projectBoards,
    boardSuggestionInfo.searchText,
    project?.cosenseProjectName,
    showBoardSuggestions
  );

  const [dimensions] = useState({
    width: "auto" as const, // 固定幅に設定
    height: "auto" as const,
  });
  const noteRef = useRef<HTMLDivElement>(null);
  const dragOffset = useRef({ x: 0, y: 0, startX: 0, startY: 0 });
  const contentRef = useRef<HTMLTextAreaElement>(null);
  const [notePosition, setNotePosition] = useState({ left: 0, top: 0 });

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

  // 付箋の画面上の位置を追跡
  useEffect(() => {
    const updateNotePosition = () => {
      if (noteRef.current) {
        const rect = noteRef.current.getBoundingClientRect();
        setNotePosition({
          left: rect.left + rect.width / 2, // 付箋の中央のX座標
          top: rect.top - 22, // 付箋の上部から22px上
        });
      }
    };

    updateNotePosition();
  }, [position, isHovered, showToolbar, panX, panY, zoom]); // 位置変更時、ホバー時、ツールバー表示時、パン・ズーム変更時に更新

  // リサイズとスクロールの監視を別のuseEffectに分離
  useEffect(() => {
    const updateNotePosition = () => {
      if (noteRef.current) {
        const rect = noteRef.current.getBoundingClientRect();
        setNotePosition({
          left: rect.left + rect.width / 2,
          top: rect.top - 22,
        });
      }
    };

    window.addEventListener("resize", updateNotePosition);
    window.addEventListener("scroll", updateNotePosition);

    return () => {
      window.removeEventListener("resize", updateNotePosition);
      window.removeEventListener("scroll", updateNotePosition);
    };
  }, []); // 一度だけ監視を設定

  // グローバルキャッシュを使用したサムネイル取得
  useEffect(() => {
    if (!content || !board?.projectId) return;
    
    const fetchNewThumbnails = async () => {
      // [name.icon]記法を検出
      const iconMatches = [...content.matchAll(/\[([^\]]+)\.icon(\*\d+)?\]/g)];
      const boardNames = iconMatches.map(match => match[1]);
      
      // 未取得のボード名のみフィルタ（グローバルキャッシュとローカルキャッシュ両方をチェック）
      const uncachedNames = boardNames.filter(name => {
        const cacheKey = `${board.projectId}:${name}`;
        return newBoardThumbnails[name] === undefined && !globalThumbnailCache.has(cacheKey);
      });
      
      // グローバルキャッシュにあるものは即座にローカルキャッシュに反映
      const cachedFromGlobal: Record<string, string | null> = {};
      boardNames.forEach(name => {
        const cacheKey = `${board.projectId}:${name}`;
        if (globalThumbnailCache.has(cacheKey) && newBoardThumbnails[name] === undefined) {
          cachedFromGlobal[name] = globalThumbnailCache.get(cacheKey) || null;
        }
      });
      
      if (Object.keys(cachedFromGlobal).length > 0) {
        setNewBoardThumbnails(prev => ({ ...prev, ...cachedFromGlobal }));
      }
      
      if (uncachedNames.length === 0) return;
      
      console.log(`[StickyNote] Fetching thumbnails from global cache for: ${uncachedNames.join(', ')}`);
      
      // グローバルキャッシュを使用して並列取得
      const promises = uncachedNames.map(async (boardName) => {
        const thumbnailUrl = await getCachedThumbnail(board.projectId, boardName);
        return { boardName, thumbnailUrl };
      });
      
      const results = await Promise.all(promises);
      
      // 一括でstate更新
      const newThumbnails: Record<string, string | null> = {};
      results.forEach(({ boardName, thumbnailUrl }) => {
        newThumbnails[boardName] = thumbnailUrl;
      });
      
      setNewBoardThumbnails(prev => ({ ...prev, ...newThumbnails }));
    };
    
    fetchNewThumbnails();
  }, [content, board?.projectId]); // fetchBoardThumbnailFromDenormalizedを削除

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
      const linkMatches = content.matchAll(/\[([^\]]+)\](?!\.icon)/g);
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
          let foundMatch = false;

          if (board.projectId) {
            // インデックスから効率的に検索
            const { getBoardIdByTitle } = await import(
              "../utils/boardTitleIndex"
            );
            const targetBoardId = await getBoardIdByTitle(
              board.projectId,
              boardName
            );

            if (targetBoardId && isMounted) {
              // サムネイル用のボードでもリンク用のIDを保存
              setBoardLinks(
                (prev) => new Map(prev.set(boardName, targetBoardId))
              );

              // 自分自身の場合は現在のボードのサムネイル取得を試行
              if (targetBoardId === board.id) {
                try {
                  const currentBoardInfo = await getBoardInfo(board.id);
                  if (!isMounted) break;

                  setBoardThumbnails(
                    (prev) =>
                      new Map(
                        prev.set(boardName, currentBoardInfo.thumbnailUrl)
                      )
                  );
                } catch {
                  if (isMounted) {
                    setBoardThumbnails(
                      (prev) => new Map(prev.set(boardName, null))
                    );
                  }
                }
              } else {
                try {
                  const otherBoardInfo = await getBoardInfo(targetBoardId);
                  if (isMounted) {
                    setBoardThumbnails(
                      (prev) =>
                        new Map(
                          prev.set(boardName, otherBoardInfo.thumbnailUrl)
                        )
                    );
                  }
                } catch {
                  if (isMounted) {
                    setBoardThumbnails(
                      (prev) => new Map(prev.set(boardName, null))
                    );
                  }
                }
              }
              foundMatch = true;
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
          let foundMatch = false;

          if (board.projectId) {
            // インデックスから効率的に検索
            const { getBoardIdByTitle } = await import(
              "../utils/boardTitleIndex"
            );
            const targetBoardId = await getBoardIdByTitle(
              board.projectId,
              boardName
            );

            if (targetBoardId && isMounted) {
              setBoardLinks(
                (prev) => new Map(prev.set(boardName, targetBoardId))
              );
              foundMatch = true;
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
          continue;
        }

        try {
          let foundMatch = false;

          if (board.projectId) {
            // インデックスから効率的に検索
            const { getBoardIdByTitle } = await import(
              "../utils/boardTitleIndex"
            );
            const targetBoardId = await getBoardIdByTitle(
              board.projectId,
              boardName
            );

            if (targetBoardId && isMounted) {
              setBoardLinks(
                (prev) => new Map(prev.set(boardName, targetBoardId))
              );

              if (targetBoardId === board.id) {
                try {
                  const currentBoardInfo = await getBoardInfo(board.id);
                  if (!isMounted) break;
                  setBoardThumbnails(
                    (prev) =>
                      new Map(
                        prev.set(boardName, currentBoardInfo.thumbnailUrl)
                      )
                  );
                } catch {
                  if (isMounted) {
                    setBoardThumbnails(
                      (prev) => new Map(prev.set(boardName, null))
                    );
                  }
                }
              } else {
                try {
                  const otherBoardInfo = await getBoardInfo(targetBoardId);
                  if (isMounted) {
                    setBoardThumbnails(
                      (prev) =>
                        new Map(
                          prev.set(boardName, otherBoardInfo.thumbnailUrl)
                        )
                    );
                  }
                } catch {
                  if (isMounted) {
                    setBoardThumbnails(
                      (prev) => new Map(prev.set(boardName, null))
                    );
                  }
                }
              }
              foundMatch = true;
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

  // 影のスタイルを計算する関数（強制再レンダリングではなく、必要時のみ計算）
  const getShadowStyle = useMemo(() => {
    // 透明色の付箋は影を表示しない
    if (noteColor === "transparent") {
      return { boxShadow: "none" };
    }

    const lastUpdate = note.updatedAt || note.createdAt;
    const now = Date.now();
    const timeDiff = now - lastUpdate;

    // 影の強度を時間経過に応じて調整（計算のみ、タイマー不要）
    let shadowIntensity = 1;
    if (timeDiff < 60 * 1000) {
      shadowIntensity = 1.2;
    } else if (timeDiff < 5 * 60 * 1000) {
      shadowIntensity = 0.7;
    } else if (timeDiff < 30 * 60 * 1000) {
      shadowIntensity = 0.5;
    } else if (timeDiff < 60 * 60 * 1000) {
      shadowIntensity = 0.3;
    } else {
      shadowIntensity = 0.05;
    }

    return {
      boxShadow: `0 0px ${16 * shadowIntensity}px rgba(0, 0, 0, 0.15)`,
    };
  }, [note.updatedAt, note.createdAt, noteColor]);

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    // 編集中はドラッグを無効化
    if (isEditing) {
      return;
    }

    // 透明色の付箋はドラッグを無効化し、イベントを親に伝播させる
    if (noteColor === "transparent") {
      // イベントの伝播を許可してボードのパン機能を有効にする
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
    const oldContent = content;

    // 実際にコンテンツが変更されていない場合は何もしない
    if (newContent === oldContent) {
      return;
    }

    // [の補完機能
    const completion = handleBracketCompletion(oldContent, newContent);

    if (completion.shouldComplete) {
      setContent(completion.completedContent);

      // カーソルを[]の間に移動
      setTimeout(() => {
        if (contentRef.current) {
          contentRef.current.setSelectionRange(
            completion.cursorPosition,
            completion.cursorPosition
          );
        }
      }, 0);

      throttledContentUpdate(note.id, {
        content: completion.completedContent,
        width: dimensions.width,
        isEditing: true,
        editedBy: currentUserId,
        updatedAt: Date.now(),
      });
      return;
    }

    // 改行を削除
    const contentWithoutNewlines = newContent.replace(/\n/g, "");
    setContent(contentWithoutNewlines);

    // もし改行が含まれていた場合、改行を削除した内容をセット
    if (newContent !== contentWithoutNewlines) {
      setTimeout(() => {
        if (contentRef.current) {
          contentRef.current.value = contentWithoutNewlines;
        }
      }, 0);
    }

    const newCursorPosition = e.target.selectionStart || 0;
    setCursorPosition(newCursorPosition);

    const result = analyzeBoardTitleSuggestion(newContent, newCursorPosition);

    if (result.shouldShow) {
      setBoardSuggestionInfo({
        searchText: result.searchText,
        bracketStart: result.bracketStart,
        bracketEnd: result.bracketEnd,
        position: { x: 0, y: 0 }, // 相対位置なので不要
      });
      setShowBoardSuggestions(true);
      setSelectedSuggestionIndex(0);
    } else {
      setShowBoardSuggestions(false);
    }

    // 固定幅なので幅の計算は不要、コンテンツのみ更新
    throttledContentUpdate(note.id, {
      content: contentWithoutNewlines,
      width: dimensions.width,
      isEditing: true,
      editedBy: currentUserId,
      updatedAt: Date.now(),
    });
  };

  // キーボードイベントやカーソル移動を監視
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // IMEの変換中は処理をスキップ
    if (e.nativeEvent.isComposing) {
      return;
    }

    if (e.key === "Escape") {
      e.preventDefault();
      setShowBoardSuggestions(false);
      handleBlur();
    } else if (e.key === "i" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleInsertUserIcon();
    } else if (e.key === "Tab") {
      // ボード候補が表示されている場合はタブキーで候補を移動
      if (showBoardSuggestions) {
        e.preventDefault();
        if (combinedSuggestions.length > 0) {
          setSelectedSuggestionIndex((prev) =>
            prev < combinedSuggestions.length - 1 ? prev + 1 : 0
          );
        }
      }
    } else if (e.key === "Enter") {
      // Enterキーで選択された候補を確定
      if (showBoardSuggestions) {
        e.preventDefault();
        // 統合候補から選択
        if (
          combinedSuggestions.length > 0 &&
          combinedSuggestions[selectedSuggestionIndex]
        ) {
          const selectedSuggestion =
            combinedSuggestions[selectedSuggestionIndex];
          handleSelectSuggestion(
            selectedSuggestion.title,
            selectedSuggestion.type
          );
        }
      } else if (e.shiftKey) {
        // Shift+Enter: 下に新しい付箋を作成
        e.preventDefault();
        if (onAddNote) {
          const x = note.x;
          const y = note.y + 60; // 下に120px離れた位置
          const newNoteId = onAddNote(x, y);
          if (newNoteId) {
            handleBlur(); // 現在の付箋の編集を終了
            onActivate(newNoteId, false, false);
          }
        }
      }
    }
  };

  const handleSelectionChange = (
    e: React.SyntheticEvent<HTMLTextAreaElement>
  ) => {
    const target = e.target as HTMLTextAreaElement;
    const newCursorPosition = target.selectionStart || 0;
    setCursorPosition(newCursorPosition);

    // リンク記法の候補を分析
    const result = analyzeBoardTitleSuggestion(target.value, newCursorPosition);

    if (result.shouldShow) {
      setBoardSuggestionInfo({
        searchText: result.searchText,
        bracketStart: result.bracketStart,
        bracketEnd: result.bracketEnd,
        position: { x: 0, y: 0 }, // 相対位置なので不要
      });
      setShowBoardSuggestions(true);
      setSelectedSuggestionIndex(0);
    } else {
      setShowBoardSuggestions(false);
    }
  };

  const handleBlur = () => {
    setIsEditing(false);
    setShowToolbar(false);
    setShowBoardSuggestions(false);

    // コンテンツが実際に変更された場合のみupdatedAtを更新
    const hasContentChanged = content !== note.content;

    const updateData: any = {
      content,
      width: dimensions.width,
      isEditing: false,
      editedBy: null,
    };

    if (hasContentChanged) {
      updateData.updatedAt = Date.now();
    }

    console.log("handleBlur - updateData:", updateData);
    onUpdate(note.id, updateData);

    // 編集完了時のコールバックを実行
    if (onBlur) {
      onBlur();
    }
  };

  // 編集モードが終了したときは候補を非表示
  useEffect(() => {
    if (!isEditing) {
      setShowBoardSuggestions(false);
    }
  }, [isEditing]);

  // ボード候補を選択したときの処理
  const handleSelectBoard = (boardName: string) => {
    const { bracketStart, bracketEnd } = boardSuggestionInfo;
    const newContent =
      content.substring(0, bracketStart + 1) +
      boardName +
      content.substring(bracketEnd);

    setContent(newContent);
    setShowBoardSuggestions(false);

    // カーソルを]の後に移動
    const newCursorPosition = bracketStart + 1 + boardName.length + 1;
    setTimeout(() => {
      if (contentRef.current) {
        contentRef.current.setSelectionRange(
          newCursorPosition,
          newCursorPosition
        );
        contentRef.current.focus();
      }
    }, 0);

    throttledContentUpdate(note.id, {
      content: newContent,
      width: dimensions.width,
      isEditing: true,
      editedBy: currentUserId,
      updatedAt: Date.now(),
    });
  };

  // 統合候補を選択したときの処理
  const handleSelectSuggestion = (
    title: string,
    type: "board" | "scrapbox"
  ) => {
    console.log("[StickyNote] Selecting suggestion:", { title, type });
    const { bracketStart, bracketEnd } = boardSuggestionInfo;
    const newContent =
      content.substring(0, bracketStart + 1) +
      title +
      content.substring(bracketEnd);

    setContent(newContent);
    setShowBoardSuggestions(false);

    // カーソルを]の後に移動
    const newCursorPosition = bracketStart + 1 + title.length + 1;
    setTimeout(() => {
      if (contentRef.current) {
        contentRef.current.setSelectionRange(
          newCursorPosition,
          newCursorPosition
        );
        contentRef.current.focus();
      }
    }, 0);

    throttledContentUpdate(note.id, {
      content: newContent,
      width: dimensions.width,
      isEditing: true,
      editedBy: currentUserId,
      updatedAt: Date.now(),
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

    return baseSize * sizeMultiplier;
  };

  // アスタリスクの数からYouTube動画サイズを計算
  const getYouTubeSize = (line: string) => {
    const baseWidth = 280;
    const baseHeight = 157;
    let sizeMultiplier = 1;

    // *のみをチェック
    const asteriskOnlyMatch = line.match(/^(\*+)(.*)/);

    if (asteriskOnlyMatch) {
      const asteriskCount = asteriskOnlyMatch[1].length;
      // テストの期待値に合わせて計算
      // * = 420x236, ** = 560x315, *** = 700x394
      if (asteriskCount === 1) {
        sizeMultiplier = 1.5; // 420/280 = 1.5
      } else if (asteriskCount === 2) {
        sizeMultiplier = 2.0; // 560/280 = 2.0
      } else if (asteriskCount === 3) {
        sizeMultiplier = 2.5; // 700/280 = 2.5
      } else {
        sizeMultiplier = 1 + asteriskCount * 0.5;
      }
    }

    return {
      width: Math.round(baseWidth * sizeMultiplier),
      height: Math.round(baseHeight * sizeMultiplier),
    };
  };

  // アスタリスクの数からGoogle Docサイズを計算
  const getGoogleDocSize = (line: string) => {
    const baseWidth = 240; // より小さなベースサイズ
    const baseHeight = 320;
    let sizeMultiplier = 1;

    // *のみをチェック
    const asteriskOnlyMatch = line.match(/^(\*+)(.*)/);

    if (asteriskOnlyMatch) {
      const asteriskCount = asteriskOnlyMatch[1].length;
      // 1つ星ごとに1.2倍（より緩やかな増加）
      sizeMultiplier = Math.pow(1.2, asteriskCount);
    }

    return {
      width: Math.round(baseWidth * sizeMultiplier),
      height: Math.round(baseHeight * sizeMultiplier),
    };
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

  // 付箋全体がYouTubeのURLのみかどうかをチェック
  const isContentOnlyYouTubeUrl = (content: string) => {
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

    return isYouTubeUrl(trimmedContent);
  };

  // Google DocsのURLかどうかをチェック
  const isGoogleDocUrl = (text: string) => {
    const url = text.trim();
    // Google Docs, Sheets, Slides の埋め込み用URLをチェック
    return (
      (url.includes("docs.google.com/document") &&
        (url.includes("embedded=true") ||
          url.includes("/pub") ||
          url.includes("/embed"))) ||
      (url.includes("docs.google.com/spreadsheets") &&
        (url.includes("pubhtml") || url.includes("embed"))) ||
      (url.includes("docs.google.com/presentation") && url.includes("/embed"))
    );
  };

  // iframe タグから src URL を抽出
  const extractIframeSrc = (iframeTag: string): string | null => {
    const srcMatch = iframeTag.match(/src=["']([^"']+)["']/);
    if (!srcMatch) return null;

    const src = srcMatch[1];
    // Google Document の埋め込みURLのみ許可
    if (isGoogleDocUrl(src)) {
      return src;
    }
    return null;
  };

  // コンテンツが iframe タグかどうかをチェック
  const isIframeTag = (content: string): boolean => {
    const trimmed = content.trim();
    return trimmed.startsWith("<iframe") && trimmed.includes("</iframe>");
  };

  // 付箋全体がGoogle DocsのURLのみかどうかをチェック
  const isContentOnlyGoogleDocUrl = (content: string) => {
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

    return isGoogleDocUrl(trimmedContent);
  };

  // 付箋全体がiframeタグのみかどうかをチェック
  const isContentOnlyIframe = (content: string) => {
    const lines = content.split("\n").filter((line) => line.trim() !== "");
    if (lines.length !== 1) return false;

    const line = lines[0].trim();
    const withoutAsterisks = line.replace(/^\*+/, "");
    const trimmedContent = withoutAsterisks.trim();

    return isIframeTag(trimmedContent);
  };

  // コンテンツを解析して画像、リンク、テキストを分離
  const parseContent = (text: string): ParsedContent[] => {
    // textがundefinedまたはnullの場合は空の配列を返す
    if (!text) {
      return [];
    }

    // 末尾のアスタリスクを除去（縮小記法なので表示しない）
    const contentWithoutTrailingAsterisks = text.replace(/\*+$/, "");

    // 付箋全体がiframeタグの場合は埋め込みとして処理
    if (isContentOnlyIframe(contentWithoutTrailingAsterisks)) {
      const lines = contentWithoutTrailingAsterisks
        .split("\n")
        .filter((line) => line.trim() !== "");
      const line = lines[0].trim();
      const asteriskMatch = line.match(/^(\*+)(.*)/);

      let iframeContent: string;
      let size: { width: number; height: number };

      if (asteriskMatch) {
        iframeContent = asteriskMatch[2].trim();
        size = getGoogleDocSize(line);
      } else {
        iframeContent = line;
        size = getGoogleDocSize(line);
      }

      const src = extractIframeSrc(iframeContent);
      if (src) {
        return [
          {
            type: "googledocembed",
            embedUrl: src,
            originalUrl: iframeContent,
            size: size,
          },
        ];
      }
    }

    // Google DocsのURLの直接貼り付けは通常のテキストとして処理（埋め込みにしない）

    // 付箋全体がYouTubeのURLのみの場合は埋め込みとして処理
    if (isContentOnlyYouTubeUrl(contentWithoutTrailingAsterisks)) {
      const lines = contentWithoutTrailingAsterisks
        .split("\n")
        .filter((line) => line.trim() !== "");
      const line = lines[0].trim();
      const asteriskMatch = line.match(/^(\*+)(.*)/);

      if (asteriskMatch) {
        const contentAfterAsterisks = asteriskMatch[2];
        const embedUrl = getYouTubeEmbedUrl(contentAfterAsterisks);

        if (embedUrl) {
          return [
            {
              type: "youtubeembed",
              embedUrl: embedUrl,
              originalUrl: contentAfterAsterisks,
              size: getYouTubeSize(line),
            },
          ];
        }
      } else {
        const embedUrl = getYouTubeEmbedUrl(line);
        if (embedUrl) {
          return [
            {
              type: "youtubeembed",
              embedUrl: embedUrl,
              originalUrl: line,
              size: getYouTubeSize(line),
            },
          ];
        }
      }
    }

    // 付箋全体がGyazoのURLのみの場合は画像として処理
    if (isContentOnlyGyazoUrl(contentWithoutTrailingAsterisks)) {
      const lines = contentWithoutTrailingAsterisks
        .split("\n")
        .filter((line) => line.trim() !== "");
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
    const lines = contentWithoutTrailingAsterisks.split("\n");
    const result: ParsedContent[] = [];

    for (const line of lines) {
      // まずScrapbox記法を処理
      let processedLine = line.replace(
        /\[([^\]]+?)\s+(https?:\/\/[^\s\]]+)\]/g,
        (match, linkText, url) => {
          return `__SCRAPBOX__${linkText}__URL__${url}__SCRAPBOX__`;
        }
      );

      // 次に通常のURLを処理（既に処理済みのScrapbox記法と角括弧内のURLは除外）
      processedLine = processedLine.replace(
        /(https?:\/\/[^\s\]]+)(?!__SCRAPBOX__)(?![^\]]*\])/g,
        (match) => {
          if (isUrl(match)) {
            return `__LINK__${match}__LINK__`;
          }
          return match;
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
        // ボードアイコン、ボードリンク、任意の画像、Gyazo URL、サムネイル画像のパターンをマッチ
        const combinedPattern =
          /\[([^\]]*https:\/\/gyazo\.com\/[^\]]+)\]|\[([^\]]+)\.icon(?:\*(\d+))?\]|(\*+)?\[([^\]]+)\.img\]|\[([^\]]+)\](?!\.icon)(?!\.img)|\[image:([^\]]+)\]/g;
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
            // Gyazo URLを通常の画像として追加
            const gyazoUrl = match[1];
            const imageUrl = getGyazoImageUrl(gyazoUrl);
            if (imageUrl) {
              parts.push({
                type: "image",
                url: imageUrl,
                size: 100,
                originalUrl: gyazoUrl,
              });
            } else {
              parts.push({ type: "text", content: `[${gyazoUrl}]` });
            }
          } else if (match[2]) {
            // [name.icon]記法をボードサムネイルとして処理
            const name = match[2];
            const count = match[3] ? parseInt(match[3], 10) : 1;

            // 数分だけボードサムネイルを追加
            for (let i = 0; i < count; i++) {
              parts.push({
                type: "boardthumbnail",
                boardName: name,
                thumbnailUrl: null, // レンダリング時に動的に取得
              });
            }
          } else if (match[5]) {
            // [name.img]記法をボードサムネイル画像として処理
            const asterisks = match[4] || "";
            const name = match[5];
            const sizeMultiplier =
              asterisks.length > 0 ? asterisks.length + 1 : 1;
            parts.push({
              type: "boardthumbnailimage",
              boardName: name,
              thumbnailUrl: null, // レンダリング時に動的に取得
              sizeMultiplier: sizeMultiplier,
            });
          } else if (match[6]) {
            // [name]記法をボードリンクとして処理
            const name = match[6];
            parts.push({
              type: "boardlink",
              boardName: name,
              boardId: null, // レンダリング時に動的に取得
            });
          } else if (match[7]) {
            // インライン画像を追加
            parts.push({ type: "inlineimage", url: match[7] });
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
  const renderTextWithLinks = (text: string, fontSize?: number) => {
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
              fontSize: fontSize ? `${fontSize}px` : undefined,
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
              fontSize: fontSize ? `${fontSize}px` : undefined,
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
    // 一括ドラッグ中はクリックを無視（ただし、Shift+クリックは許可）
    if (isDraggingMultiple && !e.shiftKey) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }

    e.stopPropagation();
    const isCommandClick = e.ctrlKey || e.metaKey;
    const isShiftClick = e.shiftKey;

    // 透明な付箋でCmd/Ctrlクリックの場合は編集モードに入る
    if (
      noteColor === "transparent" &&
      isCommandClick &&
      !isShiftClick &&
      canEditNote
    ) {
      setIsEditing(true);
      setShowToolbar(true);
      // 編集状態を他のユーザーに同期（updatedAtは更新しない）
      onUpdate(note.id, {
        isEditing: true,
        editedBy: currentUserId,
      });
      // フォーカスを設定
      setTimeout(() => {
        if (contentRef.current) {
          contentRef.current.focus();
        }
      }, 0);
      return;
    }

    const isMultiSelect = isCommandClick && !isShiftClick;
    onActivate(note.id, isMultiSelect, isShiftClick);
  };

  const handleDoubleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    // Shiftキーが押されている場合はダブルクリックを無視
    if (e.shiftKey) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    
    if (isEditing) {
      return;
    }

    e.stopPropagation();

    // 透明な付箋の場合はコンテキストメニューを表示
    if (noteColor === "transparent") {
      // 付箋内の相対位置を計算
      const rect = e.currentTarget.getBoundingClientRect();
      const relativeX = e.clientX - rect.left;
      const relativeY = e.clientY - rect.top;
      setContextMenuPosition({ x: relativeX, y: relativeY });
      setShowContextMenu(true);
      return;
    }

    // 通常の付箋の場合は編集モードに入る
    if (canEditNote) {
      setIsEditing(true);
      setShowToolbar(true);
      // 編集状態を他のユーザーに同期（updatedAtは更新しない）
      onUpdate(note.id, {
        isEditing: true,
        editedBy: currentUserId,
      });
      // フォーカスを設定
      setTimeout(() => {
        if (contentRef.current) {
          contentRef.current.focus();
        }
      }, 0);
    } else {
      // 編集権限がない場合は何もしない
      return;
    }
  };

  const handleContextMenuAddNote = () => {
    if (onAddNote) {
      // ダブルクリックした位置に新しい付箋を追加
      // contextMenuPositionは付箋内の相対位置（ピクセル座標）
      // ワールド座標に変換するためにzoomで割る
      const relativeX = contextMenuPosition.x / zoom;
      const relativeY = contextMenuPosition.y / zoom;
      // 付箋の座標に相対位置を加算
      const x = note.x + relativeX;
      const y = note.y + relativeY;
      const newNoteId = onAddNote(x, y);
      if (newNoteId) {
        onActivate(newNoteId, false, false);
      }
    }
    setShowContextMenu(false);
  };

  const handleContextMenuEdit = () => {
    if (canEditNote) {
      setIsEditing(true);
      setShowToolbar(true);
      // 編集状態を他のユーザーに同期（updatedAtは更新しない）
      onUpdate(note.id, {
        isEditing: true,
        editedBy: currentUserId,
      });
      // フォーカスを設定
      setTimeout(() => {
        if (contentRef.current) {
          contentRef.current.focus();
        }
      }, 0);
    }
    setShowContextMenu(false);
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
      // 編集状態を他のユーザーに同期（updatedAtは更新しない）
      onUpdate(note.id, {
        isEditing: true,
        editedBy: currentUserId,
      });
      // フォーカスを設定
      setTimeout(() => {
        if (contentRef.current) {
          contentRef.current.focus();
        }
      }, 0);
      // フォーカス完了を通知
      if (onFocused) {
        onFocused();
      }
    }
  }, [
    shouldFocus,
    isEditing,
    onFocused,
    canEditNote,
    onUpdate,
    note.id,
    currentUserId,
  ]);

  // コンテキストメニューを閉じる処理
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest(".context-menu")) {
        setShowContextMenu(false);
      }
    };

    if (showContextMenu) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => {
        document.removeEventListener("mousedown", handleClickOutside);
      };
    }
  }, [showContextMenu]);

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
    if (!text) {
      return [];
    }

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

  const parsedContent = useMemo(() => parseContent(content || ""), [content]);

  // 末尾のアスタリスクで縮小サイズを計算
  const calculateShrinkSize = (content: string) => {
    if (!content) return null;

    const trailingAsteriskMatch = content.match(/\*+$/);
    if (!trailingAsteriskMatch) {
      return null;
    }

    const asteriskCount = trailingAsteriskMatch[0].length;
    const baseSize = getTextSizeStyle(textSize);
    const shrinkSize = baseSize - asteriskCount * 2;
    return shrinkSize;
  };

  const shrinkSize = calculateShrinkSize(content || "");
  const actualFontSize = shrinkSize || getTextSizeStyle(textSize);

  // フォントサイズに応じてline-heightを調整
  const calculateLineHeight = (fontSize: number) => {
    // 小さなフォントサイズでは小さなline-heightを使用してコンパクトに
    if (fontSize <= 7) {
      return 1.1;
    } else if (fontSize <= 10) {
      return 1.2;
    } else {
      return 1.3; // 通常サイズ
    }
  };

  const actualLineHeight = calculateLineHeight(actualFontSize);

  // フォントサイズに応じてpaddingを調整
  const calculatePadding = (fontSize: number) => {
    // 小さなフォントサイズでは小さなpaddingを使用してコンパクトに
    if (fontSize <= 7) {
      return 4; // 極小サイズ
    } else if (fontSize <= 11) {
      // 11pxまでを小サイズに含める
      return 6; // 小サイズ
    } else {
      return 10; // 通常サイズ
    }
  };

  const actualPadding = calculatePadding(actualFontSize);

  const backgroundColor = getColorStyle(noteColor);
  const borderColor = calculateBorderColor(backgroundColor);

  // 新着チェック
  const isNewNote = isNoteNewerThanLastView(
    board.id,
    note.createdAt,
    note.updatedAt
  );

  // 更新時間に基づいて影のサイズを計算
  const calculateShadowByRecency = () => {
    if (noteColor === "transparent") return "none";

    const now = Date.now();
    const lastUpdate = note.updatedAt || note.createdAt;
    const timeDiff = now - lastUpdate;

    // 時間の閾値（ミリ秒）
    const oneMinute = 60 * 1000;
    const fiveMinutes = 5 * 60 * 1000;
    const thirtyMinutes = 30 * 60 * 1000;
    const oneHour = 60 * 60 * 1000;
    const oneDay = 24 * 60 * 60 * 1000;

    // 時間差に応じて影のサイズを決定
    if (timeDiff < oneMinute) {
      // 1分以内: 大きな影
      return "0 4px 20px rgba(0, 0, 0, 0.15), 0 2px 8px rgba(0, 0, 0, 0.1)";
    } else if (timeDiff < fiveMinutes) {
      // 5分以内: やや大きな影
      return "0 3px 15px rgba(0, 0, 0, 0.12), 0 1px 6px rgba(0, 0, 0, 0.08)";
    } else if (timeDiff < thirtyMinutes) {
      // 30分以内: 中程度の影
      return "0 2px 10px rgba(0, 0, 0, 0.08), 0 1px 4px rgba(0, 0, 0, 0.06)";
    } else if (timeDiff < oneHour) {
      // 1時間以内: 小さめの影
      return "0 1px 6px rgba(0, 0, 0, 0.06), 0 0px 3px rgba(0, 0, 0, 0.04)";
    } else if (timeDiff < oneDay) {
      // 1日以内: 小さな影
      return "0 0px 4px rgba(0, 0, 0, 0.04)";
    } else {
      // 1日以上: 最小の影
      return "0 0px 2px rgba(0, 0, 0, 0.02)";
    }
  };

  return (
    <div
      id={`note-${note.id}`}
      ref={noteRef}
      data-note-id={note.id}
      data-note-content={content}
      className={`sticky-note ${isActive ? "active" : ""} ${
        isSelected ? "selected" : ""
      } ${interactionBorderColor ? "being-used" : ""}`}
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
        backgroundColor: backgroundColor,
        ...getShadowStyle,
        border:
          noteColor === "transparent" ? "none" : `1px solid ${borderColor}`,
        zIndex: noteColor === "transparent" ? -1 : note.zIndex || 1,
        opacity: 1,
        fontSize: `${actualFontSize}px`,
        padding: `${actualPadding}px`,
        ...(interactionBorderColor && {
          borderColor: interactionBorderColor,
          borderWidth: "1px",
          borderStyle: "solid",
        }),
      }}
      onMouseDown={handleMouseDown}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      onMouseEnter={() => setHoveredDebounced(true)}
      onMouseLeave={() => setHoveredDebounced(false)}
    >
      {/* 新着マーク */}
      {isNewNote && noteColor !== "transparent" && (
        <div
          style={{
            overflow: "hidden",
            position: "absolute",
            top: "0px",
            right: "0px",
            width: "14px",
            height: "14px",
          }}
        >
          <div
            style={{
              width: "14px",
              height: "14px",
              position: "absolute",
              top: "-8px",
              right: "-8px",
              transform: "rotate(45deg)",
              backgroundColor: "#96cc95",
              zIndex: 1000,
              pointerEvents: "none",
            }}
          />
        </div>
      )}

      <div className="note-content" style={{ position: "relative" }}>
        {isEditing && canEditNote ? (
          <TextareaAutosize
            ref={contentRef}
            value={content}
            onChange={handleContentChange}
            onBlur={handleBlur}
            onKeyDown={handleKeyDown}
            onSelect={handleSelectionChange}
            onWheel={(e) => e.stopPropagation()}
            minRows={1}
            maxRows={10}
          />
        ) : (
          <div
            onClick={() => {}}
            style={{
              opacity: 1,
              position: "relative",
            }}
          >
            <div
              style={{
                lineHeight: actualLineHeight,
                overflowWrap: "break-word",
                whiteSpace: "pre-wrap",
                width: "auto",
                maxWidth: parsedContent.find(
                  (c) =>
                    c.type === "image" ||
                    c.type === "boardthumbnailimage" ||
                    c.type === "youtubeembed" ||
                    c.type === "googledocembed"
                )
                  ? "none"
                  : "160px",
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
                        onDragStart={(e) => e.preventDefault()}
                        onMouseDown={(e) => e.preventDefault()}
                      />
                    </div>
                  );
                } else if (item.type === "youtubeembed") {
                  return (
                    <div key={index} style={{ margin: "4px 0" }}>
                      <iframe
                        src={item.embedUrl}
                        title="YouTube video"
                        style={{
                          width: `${item.size.width}px`,
                          height: `${item.size.height}px`,
                          borderRadius: "4px",
                          border: "none",
                        }}
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        allowFullScreen
                      />
                    </div>
                  );
                } else if (item.type === "googledocembed") {
                  return (
                    <div key={index} style={{ margin: "4px 0" }}>
                      <iframe
                        src={item.embedUrl}
                        title="Google Document"
                        style={{
                          width: `${item.size.width}px`,
                          height: `${item.size.height}px`,
                          borderRadius: "4px",
                          border: "none",
                        }}
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
                        userSelect: "none",
                      }}
                      draggable={false}
                      onDragStart={(e) => e.preventDefault()}
                      onError={(e) => {
                        // 画像が読み込めなかった場合のフォールバック
                        const target = e.target as HTMLImageElement;
                        target.style.display = "none";
                      }}
                    />
                  );
                } else if (item.type === "boardthumbnail") {
                  // 新しいDenormalizedBoard方式を優先、フォールバックで古い方式
                  const thumbnailUrl = newBoardThumbnails[item.boardName] !== undefined 
                    ? newBoardThumbnails[item.boardName]
                    : boardThumbnails.get(item.boardName);
                  
                  // サムネイル取得中またはサムネイルが無い場合はテキスト表示
                  if (thumbnailUrl === undefined || thumbnailUrl === null) {
                    return (
                      <span
                        key={index}
                        style={{
                          display: "inline-block",
                          padding: "1px 3px",
                          backgroundColor: thumbnailUrl === undefined ? "#f0f0f0" : "#e8e8e8",
                          color: thumbnailUrl === undefined ? "#666" : "#888",
                          borderRadius: "3px",
                          fontSize: "0.8em",
                          verticalAlign: "middle",
                          userSelect: "none",
                          border: "1px solid #ddd"
                        }}
                      >
                        {item.boardName}
                      </span>
                    );
                  }
                  
                  // サムネイルがある場合は画像表示
                  return (
                    <img
                      key={index}
                      src={thumbnailUrl}
                      alt={`${item.boardName} thumbnail`}
                      style={{
                        width: "1em",
                        height: "1em",
                        verticalAlign: "middle",
                        display: "inline-block",
                        borderRadius: "2px",
                        userSelect: "none",
                      }}
                      draggable={false}
                      onDragStart={(e) => e.preventDefault()}
                      onError={(e) => {
                        // 画像が読み込めなかった場合はテキスト表示にフォールバック
                        const target = e.target as HTMLImageElement;
                        const parent = target.parentElement;
                        if (parent) {
                          const textSpan = document.createElement('span');
                          textSpan.textContent = item.boardName;
                          textSpan.style.cssText = `
                            display: inline-block;
                            padding: 1px 3px;
                            backgroundColor: #ffebee;
                            color: #c62828;
                            borderRadius: 3px;
                            fontSize: 0.8em;
                            verticalAlign: middle;
                            userSelect: none;
                            border: 1px solid #ffcdd2;
                          `;
                          parent.replaceChild(textSpan, target);
                        }
                      }}
                    />
                  );
                } else if (item.type === "boardthumbnailimage") {
                  // [pageTitle.img]記法でボードサムネイル画像を表示
                  const sizeMultiplier = item.sizeMultiplier || 1;
                  const baseWidth = 100;
                  const maxWidth = baseWidth * sizeMultiplier;

                  return (
                    <ThumbnailImage
                      key={index}
                      boardName={item.boardName}
                      projectId={project?.id || ""}
                      style={{
                        display: "inline-block",
                        verticalAlign: "middle",
                        maxWidth: `${maxWidth}px`,
                        width: `${maxWidth}px`,
                        userSelect: "none",
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
                          color: "#0066cc",
                          textDecoration: "underline",
                          cursor: "pointer",
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
                  let fontSize = actualFontSize; // 末尾アスタリスクで設定されたサイズを使用
                  let displayContent = item.content;

                  // 末尾アスタリスクがない場合のみ先頭アスタリスクを処理
                  if (!shrinkSize) {
                    // *のみをチェック
                    const asteriskOnlyMatch = item.content!.match(/^(\*+)(.*)/);

                    if (asteriskOnlyMatch) {
                      // *のみの場合
                      const asteriskCount = asteriskOnlyMatch[1].length;
                      fontSize = 13 + asteriskCount * 2;
                      displayContent = asteriskOnlyMatch[2];
                    }
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
                      {renderTextWithLinks(displayContent || "", fontSize)}
                    </span>
                  );
                }
              })}
            </div>
          </div>
        )}
      </div>
      {/* BoardSuggestions を StickyNote の中に配置 */}
      {showBoardSuggestions && isEditing && (
        <div
          style={{
            position: "absolute",
            top: "100%",
            left: "0",
            zIndex: 1000,
          }}
        >
          <CombinedSuggestions
            suggestions={combinedSuggestions}
            searchText={boardSuggestionInfo.searchText}
            onSelectSuggestion={handleSelectSuggestion}
            position={{ x: 0, y: 0 }} // 相対位置なので不要
            isVisible={true}
            selectedIndex={selectedSuggestionIndex}
            isLoading={suggestionsLoading}
            error={suggestionsError}
          />
        </div>
      )}
      {showContextMenu && (
        <div
          className="context-menu"
          style={{
            position: "absolute",
            left: contextMenuPosition.x,
            top: contextMenuPosition.y,
            backgroundColor: "#222",
            border: "1px solid #777",
            borderRadius: "4px",
            boxShadow: "0 2px 10px rgba(0,0,0,0.1)",
            zIndex: 10000,
            overflow: "hidden",
          }}
        >
          <button
            onClick={handleContextMenuAddNote}
            style={{
              display: "block",
              width: "100%",
              padding: "4px 8px",
              border: "none",
              background: "none",
              textAlign: "left",
              color: "white",
              cursor: "pointer",
              borderRadius: "0",
            }}
            onMouseEnter={(e) =>
              (e.currentTarget.style.backgroundColor = "#333")
            }
            onMouseLeave={(e) =>
              (e.currentTarget.style.backgroundColor = "transparent")
            }
          >
            Add sticky note
          </button>
          {canEditNote && (
            <button
              onClick={handleContextMenuEdit}
              style={{
                display: "block",
                width: "100%",
                padding: "4px 8px",
                border: "none",
                borderTop: "1px solid #777",
                background: "none",
                textAlign: "left",
                cursor: "pointer",
                color: "white",
                borderRadius: "0",
              }}
              onMouseEnter={(e) =>
                (e.currentTarget.style.backgroundColor = "#333")
              }
              onMouseLeave={(e) =>
                (e.currentTarget.style.backgroundColor = "transparent")
              }
            >
              Edit
            </button>
          )}
        </div>
      )}
      {/* ポータルでカラーツールバーを表示 */}
      {showToolbar &&
        isEditing &&
        canEditNote &&
        createPortal(
          <div
            className="note-toolbar"
            style={{
              position: "fixed",
              left: `${notePosition.left}px`,
              top: `${notePosition.top}px`,
              transform: "translateX(-50%)",
              zIndex: 99999,
              pointerEvents: "auto",
              width: "auto",
            }}
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
          </div>,
          document.body
        )}
      {/* ポータルでリンクボタンを表示 */}
      {isHovered &&
        !isEditing &&
        (extractLinks(content || "").length > 0 ||
          extractBoardLinks(content || "", boardLinks).length > 0) &&
        createPortal(
          <div
            style={{
              position: "fixed",
              left: `${notePosition.left}px`,
              top: `${notePosition.top}px`,
              transform: "translateX(-50%)",
              display: "flex",
              gap: "4px",
              background: "#444",
              borderRadius: "4px 4px 0 0",
              zIndex: 99999,
              border: "1px solid #ccc",
              borderBottom: "none",
              pointerEvents: "auto",
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
            {extractBoardLinks(content || "", boardLinks)
              .slice(0, 2)
              .map((boardLink, index) => {
                return (
                  <a
                    key={`board-${index}`}
                    href={
                      project?.slug
                        ? `/${project.slug}/${boardLink.name}`
                        : boardLink.boardId
                        ? `/${boardLink.boardId}`
                        : `/${project?.slug || "unknown"}/${boardLink.name}`
                    }
                    onClick={(e) => e.stopPropagation()}
                    style={{
                      display: "inline-block",
                      background: "none",
                      border: "none",
                      fontSize: "11px",
                      cursor: "pointer",
                      whiteSpace: "nowrap",
                      maxWidth: "150px",
                      padding: "4px 8px",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      color: boardLink.boardId ? "#eee" : "#ccc",
                      textDecoration: "none",
                    }}
                    title={`Board: ${boardLink.name}${
                      boardLink.boardId ? "" : " (will be created)"
                    }`}
                  >
                    {boardLink.name}
                  </a>
                );
              })}
            {/* Cosenseページリンク */}
            {extractCosenseLinks(content, project?.cosenseProjectName)
              .slice(0, 2)
              .map((cosenseLink, index) => (
                <a
                  key={`cosense-${index}`}
                  href={cosenseLink.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  style={{
                    display: "inline-block",
                    background: "none",
                    border: "none",
                    fontSize: "11px",
                    cursor: "pointer",
                    whiteSpace: "nowrap",
                    maxWidth: "150px",
                    padding: "4px 8px",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    color: "white",
                    textDecoration: "none",
                  }}
                  title={`Cosense: ${cosenseLink.name}`}
                >
                  <div>Cosense: {cosenseLink.name}</div>
                </a>
              ))}
          </div>,
          document.body
        )}
      {/* キーヒント表示 */}
      {hintKey &&
        noteRef.current &&
        createPortal(
          <div
            style={{
              position: "fixed",
              left: `${
                noteRef.current.getBoundingClientRect().left +
                noteRef.current.offsetWidth / 2
              }px`,
              top: `${
                noteRef.current.getBoundingClientRect().top +
                noteRef.current.offsetHeight / 2
              }px`,
              transform: "translate(-50%, -50%)",
              background: "rgba(255, 107, 53, 0.95)",
              color: "white",
              fontSize: "12px",
              fontWeight: "bold",
              padding: "4px 6px",
              borderRadius: "2px",
              zIndex: 100000,
              pointerEvents: "none",
              fontFamily: "monospace",
              boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
            }}
          >
            {hintKey}
          </div>,
          document.body
        )}
    </div>
  );
};

export const StickyNote = React.memo(StickyNoteComponent);
