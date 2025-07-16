import React, { useState, useRef, useEffect, useCallback } from "react";
import TextareaAutosize from "react-textarea-autosize";
import throttle from "lodash.throttle";
import { Note, Board, Project } from "../types";
import { checkBoardEditPermission } from "../utils/permissions";
import { LuPlus } from "react-icons/lu";

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

type ParsedContent = ImageContent | TextContent;

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
  user,
}: StickyNoteProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [content, setContent] = useState(note.content);
  const [position, setPosition] = useState({ x: note.x, y: note.y });
  const [isDragging, setIsDragging] = useState(false);
  const [showToolbar, setShowToolbar] = useState(false);
  const [noteColor, setNoteColor] = useState(note.color || "white");
  const [textSize, setTextSize] = useState(note.textSize || "medium");
  const [isHovered, setIsHovered] = useState(false);
  const [showSignButton, setShowSignButton] = useState(false);

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

    // 複数選択されている場合は一括移動を開始
    console.log('Debug: isSelected=', isSelected, 'hasMultipleSelected=', hasMultipleSelected, 'noteId=', note.id);
    if (isSelected && hasMultipleSelected) {
      console.log('Debug: Starting bulk drag for noteId=', note.id);
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
    setShowSignButton(false); // 編集終了時にSignボタンも非表示に
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

  // アスタリスクの数から画像サイズを計算
  const getImageSize = (asteriskCount: number) => {
    const baseSize = 50;
    const sizeMultiplier = Math.max(1, asteriskCount);

    return Math.min(2000, baseSize * 2 * sizeMultiplier);
  };

  // 付箋全体がGyazoのURLのみかどうかをチェック
  const isContentOnlyGyazoUrl = (content: string) => {
    const lines = content.split("\n").filter((line) => line.trim() !== "");
    if (lines.length !== 1) return false;

    const line = lines[0].trim();
    const withoutAsterisks = line.replace(/^\*+/, "");
    return (
      isGyazoUrl(withoutAsterisks) &&
      withoutAsterisks.trim() === withoutAsterisks
    );
  };

  // コンテンツを解析して画像、リンク、テキストを分離
  const parseContent = (text: string): ParsedContent[] => {
    // 付箋全体がGyazoのURLのみの場合は画像として処理
    if (isContentOnlyGyazoUrl(text)) {
      const lines = text.split("\n").filter((line) => line.trim() !== "");
      const line = lines[0].trim();
      const asteriskMatch = line.match(/^(\*+)(.*)/);

      if (asteriskMatch) {
        const asteriskCount = asteriskMatch[1].length;
        const contentAfterAsterisks = asteriskMatch[2];
        const imageUrl = getGyazoImageUrl(contentAfterAsterisks);

        if (imageUrl) {
          return [
            {
              type: "image",
              url: imageUrl,
              size: getImageSize(asteriskCount),
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
              size: getImageSize(1),
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

      // 次に通常のURLを処理（Scrapbox記法内のURLは除外）
      processedLine = processedLine.replace(
        /(https?:\/\/[^\s]+)(?!__SCRAPBOX__)/g,
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

    return result;
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
        // Scrapbox記法の処理
        const content = part.slice(12, -12); // __SCRAPBOX__を除去
        const [linkText, url] = content.split("__URL__");
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
      // 編集権限がある場合もSignボタンを表示可能にする
      setShowSignButton(true);
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
      setShowSignButton(true);
      // フォーカス完了を通知
      if (onFocused) {
        onFocused();
      }
    }
  }, [shouldFocus, isEditing, onFocused, canEditNote]);

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

  // 文字サイズ変更ハンドラー
  const handleFontSizeChange = (size: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setTextSize(size);
    onUpdate(note.id, {
      textSize: size,
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

  // サインの追加・削除処理
  const handleAddMe = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!currentUserId || currentUserId === "anonymous") {
      alert("Please log in to mark this note as yours");
      return;
    }

    // ユーザー情報を追加
    onUpdate(note.id, {
      signedBy: {
        uid: currentUserId,
        displayName: user?.displayName || null,
        photoURL: user?.photoURL || null,
      },
    });

    // ボタンは表示したままにして、テキストボックスにフォーカスを戻す
    setTimeout(() => {
      if (contentRef.current) {
        contentRef.current.focus();
      }
    }, 0);
  };

  const handleRemoveMe = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    // サイン情報を削除
    onUpdate(note.id, {
      signedBy: null,
    });

    // ボタンは表示したままにして、テキストボックスにフォーカスを戻す
    setTimeout(() => {
      if (contentRef.current) {
        contentRef.current.focus();
      }
    }, 0);
  };

  // コンテンツ内のリンクを抽出
  const extractLinks = (text: string): string[] => {
    const links: string[] = [];

    // 通常のURL
    const urlRegex = /(https?:\/\/[^\s\]]+)/g;
    const urlMatches = text.match(urlRegex);
    if (urlMatches) {
      links.push(...urlMatches);
    }

    // Scrapbox記法 [text url] から URLを抽出
    const scrapboxRegex = /\[[^\]]+\s+(https?:\/\/[^\s\]]+)\]/g;
    let match;
    while ((match = scrapboxRegex.exec(text)) !== null) {
      links.push(match[1]);
    }

    // 重複を削除
    return [...new Set(links)];
  };

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
        backgroundColor: getColorStyle(noteColor),
        boxShadow:
          noteColor === "transparent" ? "none" : "0 0 10px rgba(0, 0, 0, 0.04)",
        border: noteColor === "transparent" ? "none" : "1px solid #dedede",
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
      {isHovered && !isEditing && extractLinks(content).length > 0 && (
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
          {extractLinks(content)
            .slice(0, 3)
            .map((link, index) => (
              <button
                key={index}
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
        </div>
      )}
      {/* ツールバー */}
      {showToolbar && isEditing && canEditNote ? (
        <div className="note-toolbar" role="toolbar" aria-label="Color selection">
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
        {/* 作成者情報の表示またはAdd meボタン */}
        {note.signedBy ? (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "4px",
              marginBottom: "4px",
              fontSize: "11px",
              color: "#666",
            }}
          >
            {note.signedBy.photoURL ? (
              <img
                src={note.signedBy.photoURL}
                alt={note.signedBy.displayName || "User"}
                style={{
                  width: "16px",
                  height: "16px",
                  borderRadius: "50%",
                  objectFit: "cover",
                }}
                referrerPolicy="no-referrer"
              />
            ) : (
              <div
                style={{
                  width: "16px",
                  height: "16px",
                  borderRadius: "50%",
                  backgroundColor: "#ccc",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "10px",
                  color: "white",
                }}
              >
                {(note.signedBy.displayName || "U").charAt(0).toUpperCase()}
              </div>
            )}
            <span>{note.signedBy.displayName || "Anonymous"}</span>
            {/* 削除ボタン（自分のサインの場合のみ） */}
            {showSignButton && note.signedBy.uid === currentUserId && (
              <button
                onClick={handleRemoveMe}
                onMouseDown={(e) => e.preventDefault()}
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  fontSize: "12px",
                  color: "#999",
                  padding: "0",
                  marginLeft: "2px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: "14px",
                  height: "14px",
                }}
                title="Remove me"
              >
                ×
              </button>
            )}
          </div>
        ) : showSignButton ? (
          <div
            style={{
              marginBottom: "4px",
            }}
          >
            <button
              onClick={handleAddMe}
              onMouseDown={(e) => e.preventDefault()}
              aria-label="Add me"
              style={{
                border: "none",
                display: "flex",
                gap: "4px",
                padding: "0 4px",
                fontSize: "11px",
                cursor: "pointer",
                background: "none",
                whiteSpace: "nowrap",
                color: "#888",
              }}
            >
              <LuPlus />
              <span>Add me</span>
            </button>
          </div>
        ) : null}

        {isEditing && canEditNote ? (
          <TextareaAutosize
            ref={contentRef}
            value={content}
            onChange={handleContentChange}
            onBlur={handleBlur}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.preventDefault();
                handleBlur();
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
            {parseContent(content).map((item, index) => {
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
              } else {
                // テキストの場合、アスタリスクでフォントサイズを調整
                const asteriskMatch = item.content!.match(/^(\*+)(.*)/);
                let fontSize = 13;
                let displayContent = item.content;

                if (asteriskMatch) {
                  const asteriskCount = asteriskMatch[1].length;
                  fontSize = Math.min(30, 13 + asteriskCount * 2);
                  displayContent = asteriskMatch[2];
                }

                return (
                  <div
                    key={index}
                    style={{
                      whiteSpace: "pre-wrap",
                      wordWrap: "break-word",
                      fontSize: `${fontSize}px`,
                      margin: fontSize > 13 ? "4px 0" : "0",
                      width: `${dimensions.width}px`,
                    }}
                  >
                    {renderTextWithLinks(displayContent || "")}
                    {index === parseContent(content).length - 1 ? "\n" : ""}
                  </div>
                );
              }
            })}
          </div>
        )}
      </div>
    </div>
  );
}
