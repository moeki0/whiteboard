import { useState, useRef, useEffect, useCallback } from "react";
import TextareaAutosize from "react-textarea-autosize";
import throttle from "lodash.throttle";
import { Note } from "../types";

interface StickyNoteProps {
  note: Note;
  onUpdate: (noteId: string, updates: Partial<Note>) => void;
  onDelete: (noteId: string) => void;
  isActive: boolean;
  onActivate: (noteId: string) => void;
  currentUserId: string;
  getUserColor: (userId: string) => string;
}

export function StickyNote({
  note,
  onUpdate,
  onDelete,
  isActive,
  onActivate,
  currentUserId,
  getUserColor,
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
    return /https:\/\/gyazo\.com\/[a-zA-Z0-9]+/.test(text.trim());
  };

  // GyazoのURLから画像URLを取得
  const getGyazoImageUrl = (url: string) => {
    const match = url.match(/https:\/\/gyazo\.com\/([a-zA-Z0-9]+)/);
    if (match) {
      return `https://i.gyazo.com/${match[1]}.png`;
    }
    return null;
  };

  // アスタリスクの数から画像サイズを計算
  const getImageSize = (asteriskCount: number) => {
    const baseSize = 100;
    const sizeMultiplier = Math.max(1, asteriskCount);

    return Math.min(2000, baseSize * 2 * sizeMultiplier);
  };

  // 行が画像のみかどうかをチェック（アスタリスクを除く）
  const isImageOnlyLine = (line: string) => {
    const trimmed = line.trim();
    const withoutAsterisks = trimmed.replace(/^\*+/, "");
    return (
      isGyazoUrl(withoutAsterisks) &&
      withoutAsterisks === trimmed.replace(/^\*+/, "").trim()
    );
  };

  // コンテンツを解析して画像、リンク、テキストを分離
  const parseContent = (text: string) => {
    const lines = text.split("\n");
    const result = [];

    for (const line of lines) {
      const trimmedLine = line.trim();
      const asteriskMatch = line.match(/^(\*+)(.*)/);

      if (asteriskMatch) {
        const asteriskCount = asteriskMatch[1].length;
        const contentAfterAsterisks = asteriskMatch[2];

        // Gyazo画像で、その行が画像のみの場合
        if (isGyazoUrl(contentAfterAsterisks) && isImageOnlyLine(line)) {
          const imageUrl = getGyazoImageUrl(contentAfterAsterisks);
          if (imageUrl) {
            result.push({
              type: "image",
              url: imageUrl,
              size: getImageSize(asteriskCount),
              originalUrl: contentAfterAsterisks,
            });
            continue;
          }
        }
      }

      // 画像のみの行（アスタリスクなし）
      if (isGyazoUrl(trimmedLine) && isImageOnlyLine(line)) {
        const imageUrl = getGyazoImageUrl(trimmedLine);
        if (imageUrl) {
          result.push({
            type: "image",
            url: imageUrl,
            size: getImageSize(1),
            originalUrl: trimmedLine,
          });
          continue;
        }
      }

      // URLを含むテキスト行の解析（リンク化）
      const processedLine = line.replace(/(https?:\/\/[^\s]+)/g, (url) => {
        if (isGyazoUrl(url) && !isImageOnlyLine(line)) {
          // Gyazoだが画像のみの行ではない場合はリンクとして扱う
          return `__LINK__${url}__LINK__`;
        } else if (isUrl(url)) {
          // 普通のURL
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
    e.stopPropagation();
    onActivate(note.id);
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
      className={`sticky-note ${isActive ? "active" : ""} ${
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
