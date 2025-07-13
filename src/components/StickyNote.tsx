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
  const [dimensions, setDimensions] = useState({
    width: note.width || 100,
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

    if (note.width) {
      setDimensions((prev) => ({ ...prev, width: note.width }));
    }
  }, [note, isDragging, isEditing, currentUserId, content]);

  // Auto-resize based on content
  useEffect(() => {
    if (contentRef.current && !isEditing) {
      const measureDiv = document.createElement("div");
      measureDiv.style.cssText = `
        position: absolute;
        visibility: hidden;
        width: auto;
        height: auto;
        white-space: pre-wrap;
        word-wrap: break-word;
        font-family: Arial, Helvetica, sans-serif;
        font-size: 16px;
        line-height: 1.5;
        padding: 15px;
        min-width: 100px;
        max-width: 100px;
      `;
      measureDiv.textContent = content || "Double-click to edit...";
      document.body.appendChild(measureDiv);

      const newWidth = Math.max(60, Math.min(600, measureDiv.offsetWidth));
      setDimensions((prev) => ({ ...prev, width: newWidth }));

      document.body.removeChild(measureDiv);
    }
  }, [content, isEditing]);

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

    // Measure text width for horizontal resize
    if (e.target) {
      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d");
      if (!context) return;
      context!.font = "16px Arial, Helvetica, sans-serif";

      const lines = newContent.split("\n");
      let maxWidth = 0;

      lines.forEach((line: string) => {
        const lineWidth = context!.measureText(line || " ").width;
        maxWidth = Math.max(maxWidth, lineWidth);
      });

      const newWidth = Math.max(100, Math.min(600, maxWidth + 16));
      setDimensions((prev) => ({ ...prev, width: newWidth }));

      // Real-time content update with new width
      throttledContentUpdate(note.id, {
        content: newContent,
        width: newWidth,
        isEditing: true,
        editedBy: currentUserId,
      });
    } else {
      // Real-time content update without width change
      throttledContentUpdate(note.id, {
        content: newContent,
        width: dimensions.width,
        isEditing: true,
        editedBy: currentUserId,
      });
    }
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
        !window.getSelection()?.focusNode &&
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
        width: `${Math.max(dimensions.width, 100)}px`,
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
              whiteSpace: "pre-wrap",
              wordWrap: "break-word",
            }}
          >
            {content + "\n"}
          </div>
        )}
      </div>
    </div>
  );
}
