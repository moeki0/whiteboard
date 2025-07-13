import { useState, useRef, useEffect, useCallback } from "react";
import TextareaAutosize from "react-textarea-autosize";
import throttle from "lodash.throttle";
import { Note } from "../types";

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
  onStartBulkDrag: (noteId: string, e: React.MouseEvent<HTMLDivElement>) => void;
  currentUserId: string;
  getUserColor: (userId: string) => string;
  isDraggingMultiple?: boolean;
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
}: StickyNoteProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [content, setContent] = useState(note.content);
  const [position, setPosition] = useState({ x: note.x, y: note.y });
  const [isDragging, setIsDragging] = useState(false);
  const [dimensions] = useState({
    width: 160, // 固定幅に設定
    height: "auto" as const,
  });
  const noteRef = useRef<HTMLDivElement>(null);
  const dragOffset = useRef({ x: 0, y: 0 });
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

    // 固定幅なので動的な幅調整を削除
  }, [note, isDragging, isEditing, currentUserId, content]);

  // 固定幅なので自動リサイズは不要

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    // 編集中はドラッグを無効化
    if (isEditing) {
      return;
    }

    // 複数選択されている場合は一括移動を開始
    if (isSelected) {
      e.preventDefault(); // デフォルトの動作を防ぐ
      e.stopPropagation(); // イベント伝播を防ぐ
      onStartBulkDrag(note.id, e);
      return;
    }

    // 通常の単体ドラッグ
    setIsDragging(true);
    dragOffset.current = {
      x: e.clientX - position.x,
      y: e.clientY - position.y,
    };
    // ドラッグ開始をFirebaseに通知
    onUpdate(note.id, { isDragging: true, draggedBy: currentUserId });
  };

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (isDragging && !isEditing) {
        const newX = e.clientX - dragOffset.current.x;
        const newY = e.clientY - dragOffset.current.y;
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
    [currentUserId, isDragging, note.id, throttledUpdate]
  );

  const handleMouseUp = useCallback(() => {
    if (isDragging) {
      setIsDragging(false);
      // 最終位置を即座に更新（throttleをバイパス）
      onUpdate(note.id, {
        x: position.x,
        y: position.y,
        isDragging: false,
        draggedBy: null,
      });
    }
  }, [isDragging, note.id, onUpdate, position.x, position.y]);

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
    return /https:\/\/gyazo\.com\/[a-zA-Z0-9]+(\/(max_size|raw)\/\d+)?/.test(text.trim());
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
    const baseSize = 100;
    const sizeMultiplier = Math.max(1, asteriskCount);

    return Math.min(2000, baseSize * 2 * sizeMultiplier);
  };

  // 付箋全体がGyazoのURLのみかどうかをチェック
  const isContentOnlyGyazoUrl = (content: string) => {
    const lines = content.split('\n').filter(line => line.trim() !== '');
    if (lines.length !== 1) return false;
    
    const line = lines[0].trim();
    const withoutAsterisks = line.replace(/^\*+/, '');
    return isGyazoUrl(withoutAsterisks) && withoutAsterisks.trim() === withoutAsterisks;
  };


  // コンテンツを解析して画像、リンク、テキストを分離
  const parseContent = (text: string): ParsedContent[] => {
    // 付箋全体がGyazoのURLのみの場合は画像として処理
    if (isContentOnlyGyazoUrl(text)) {
      const lines = text.split('\n').filter(line => line.trim() !== '');
      const line = lines[0].trim();
      const asteriskMatch = line.match(/^(\*+)(.*)/);
      
      if (asteriskMatch) {
        const asteriskCount = asteriskMatch[1].length;
        const contentAfterAsterisks = asteriskMatch[2];
        const imageUrl = getGyazoImageUrl(contentAfterAsterisks);
        
        if (imageUrl) {
          return [{
            type: "image",
            url: imageUrl,
            size: getImageSize(asteriskCount),
            originalUrl: contentAfterAsterisks,
          }];
        }
      } else {
        const imageUrl = getGyazoImageUrl(line);
        if (imageUrl) {
          return [{
            type: "image",
            url: imageUrl,
            size: getImageSize(1),
            originalUrl: line,
          }];
        }
      }
    }

    // それ以外の場合はすべてテキストとしてリンク化処理
    const lines = text.split("\n");
    const result: ParsedContent[] = [];

    for (const line of lines) {
      // URLを含むテキスト行の解析（リンク化）
      const processedLine = line.replace(/(https?:\/\/[^\s]+)/g, (url) => {
        if (isUrl(url)) {
          // すべてのURLをリンクとして扱う
          return `__LINK__${url}__LINK__`;
        }
        return url;
      });

      result.push({
        type: "text",
        content: processedLine,
      });
    }

    return result;
  };

  // テキスト内のリンクを処理
  const renderTextWithLinks = (text: string) => {
    const parts = text.split(/(__LINK__[^_]+__LINK__)/);
    return parts.map((part, index) => {
      if (part.startsWith("__LINK__") && part.endsWith("__LINK__")) {
        const url = part.slice(8, -8); // __LINK__を除去
        return (
          <a
            key={index}
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              color: "#0066cc",
              textDecoration: "underline",
              cursor: "pointer",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {url}
          </a>
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
    const isMultiSelect = e.ctrlKey || e.metaKey;
    onActivate(note.id, isMultiSelect);
  };

  const handleDoubleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (isEditing) {
      return;
    }
    e.stopPropagation();
    setIsEditing(true);
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        !window
          .getSelection()
          ?.focusNode?.parentElement?.classList.contains("sticky-note") &&
        !isEditing &&
        isActive &&
        (e.key === "Delete" || e.key === "Backspace")
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
  }, [isActive, note.id, onDelete]);

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

  return (
    <div
      ref={noteRef}
      data-note-id={note.id}
      className={`sticky-note ${isActive ? "active" : ""} ${isSelected ? "selected" : ""} ${
        interactionBorderColor ? "being-used" : ""
      }`}
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
        backgroundColor: "white",
        zIndex: note.zIndex || 1,
        ...(interactionBorderColor && {
          borderColor: interactionBorderColor,
          borderWidth: "1px",
          borderStyle: "solid",
        }),
      }}
      onMouseDown={handleMouseDown}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
    >
      <div className="note-content">
        {isEditing ? (
          <TextareaAutosize
            ref={contentRef}
            value={content}
            onChange={handleContentChange}
            onBlur={handleBlur}
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
            }}
          >
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
