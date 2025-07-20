import React, { useState, useEffect } from "react";
import Xarrow from "react-xarrows";
import { Arrow as ArrowType, Note } from "../types";

interface ArrowProps {
  arrow: ArrowType;
  onUpdate: (arrowId: string, updates: Partial<ArrowType>) => void;
  isSelected: boolean;
  onSelect: (arrowId: string, isMultiSelect: boolean, isShiftSelect: boolean) => void;
  zoom: number;
  notes: Note[];
}

export function Arrow({
  arrow,
  onUpdate,
  isSelected,
  onSelect,
  zoom,
  notes,
}: ArrowProps) {
  const [isDraggingStartOffset, setIsDraggingStartOffset] = useState(false);
  const [isDraggingEndOffset, setIsDraggingEndOffset] = useState(false);
  const [dragStartPos, setDragStartPos] = useState<{ x: number; y: number } | null>(null);

  // 接続された付箋が存在するかチェック
  const startNote = notes.find(n => n.id === arrow.startNoteId);
  const endNote = notes.find(n => n.id === arrow.endNoteId);

  // ドラッグ処理（useEffectを早期リターンより前に配置）
  useEffect(() => {
    if ((!isDraggingStartOffset && !isDraggingEndOffset) || !dragStartPos) return;

    const handleMouseMove = (e: MouseEvent) => {
      const deltaX = (e.clientX - dragStartPos.x) / zoom;

      if (isDraggingStartOffset) {
        const currentStartOffset = arrow.startOffset || { x: 0, y: 0 };
        const currentStartMarginSize = Math.max(0, currentStartOffset.x);
        const newMarginSize = Math.max(0, currentStartMarginSize + deltaX);
        onUpdate(arrow.id, { 
          startOffset: { x: newMarginSize, y: 0 }
        });
      } else if (isDraggingEndOffset) {
        const currentEndOffset = arrow.endOffset || { x: 0, y: 0 };
        const currentEndMarginSize = Math.max(0, currentEndOffset.x);
        const newMarginSize = Math.max(0, currentEndMarginSize + deltaX);
        onUpdate(arrow.id, { 
          endOffset: { x: newMarginSize, y: 0 }
        });
      }

      setDragStartPos({ x: e.clientX, y: e.clientY });
    };

    const handleMouseUp = () => {
      setIsDraggingStartOffset(false);
      setIsDraggingEndOffset(false);
      setDragStartPos(null);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDraggingStartOffset, isDraggingEndOffset, dragStartPos, arrow.id, arrow.startOffset, arrow.endOffset, onUpdate, zoom]);

  // 両方の付箋が存在しない場合は何も表示しない
  if (!startNote || !endNote) {
    return null;
  }

  const startId = `note-${arrow.startNoteId}`;
  const endId = `note-${arrow.endNoteId}`;

  // デフォルト値の設定
  const startAnchor = arrow.startAnchor || 'auto';
  const endAnchor = arrow.endAnchor || 'auto';
  const startOffset = arrow.startOffset || { x: 0, y: 0 }; // デフォルト0px（付箋と同じサイズ）
  const endOffset = arrow.endOffset || { x: 0, y: 0 };

  // 付箋のDOMから実際のサイズを取得
  const getNoteSize = (noteId: string) => {
    const noteElement = document.getElementById(`note-${noteId}`);
    if (noteElement) {
      const rect = noteElement.getBoundingClientRect();
      return {
        width: rect.width,
        height: rect.height
      };
    }
    // フォールバック（DOMが見つからない場合）
    return { width: 200, height: 150 };
  };

  const startNoteSize = getNoteSize(startNote.id);
  const endNoteSize = getNoteSize(endNote.id);

  // マージンサイズ（ドラッグで調整可能）- 最小値は0
  const startMarginSize = Math.max(0, startOffset.x);
  const endMarginSize = Math.max(0, endOffset.x);

  // 仮想マージンエリアのIDを生成
  const startMarginId = `arrow-margin-start-${arrow.id}`;
  const endMarginId = `arrow-margin-end-${arrow.id}`;

  // オフセットドラッグのハンドラー
  const handleStartOffsetMouseDown = (e: React.MouseEvent) => {
    if (!isSelected) return;
    e.stopPropagation();
    setIsDraggingStartOffset(true);
    setDragStartPos({ x: e.clientX, y: e.clientY });
  };

  const handleEndOffsetMouseDown = (e: React.MouseEvent) => {
    if (!isSelected) return;
    e.stopPropagation();
    setIsDraggingEndOffset(true);
    setDragStartPos({ x: e.clientX, y: e.clientY });
  };

  // マージンエリアの位置とサイズを計算
  // 基本サイズは実際の付箋サイズ、マージンはその外側に追加
  const startMarginWidth = startNoteSize.width + startMarginSize * 2;
  const startMarginHeight = startNoteSize.height + startMarginSize * 2;
  // 付箋を仮想ボックスの中央に配置
  const startMarginX = startNote.x - startMarginSize;
  const startMarginY = startNote.y - startMarginSize;

  const endMarginWidth = endNoteSize.width + endMarginSize * 2;
  const endMarginHeight = endNoteSize.height + endMarginSize * 2;
  // 付箋を仮想ボックスの中央に配置
  const endMarginX = endNote.x - endMarginSize;
  const endMarginY = endNote.y - endMarginSize;

  return (
    <>
      {/* 開始点の仮想マージンエリア */}
      <div
        id={startMarginId}
        style={{
          position: "absolute",
          left: `${startMarginX}px`,
          top: `${startMarginY}px`,
          width: `${startMarginWidth}px`,
          height: `${startMarginHeight}px`,
          pointerEvents: "none",
          border: isSelected ? "1px dashed rgba(76, 175, 80, 0.3)" : "none",
          backgroundColor: "transparent",
        }}
      />
      
      {/* 終了点の仮想マージンエリア */}
      <div
        id={endMarginId}
        style={{
          position: "absolute",
          left: `${endMarginX}px`,
          top: `${endMarginY}px`,
          width: `${endMarginWidth}px`,
          height: `${endMarginHeight}px`,
          pointerEvents: "none",
          border: isSelected ? "1px dashed rgba(255, 152, 0, 0.3)" : "none",
          backgroundColor: "transparent",
        }}
      />

      <Xarrow
        start={startMarginId}
        end={endMarginId}
        color={isSelected ? "#2196F3" : "#666"}
        strokeWidth={isSelected ? 3 : 2}
        curveness={0.3}
        showHead={true}
        headSize={6}
        animateDrawing={false}
        zIndex={arrow.zIndex}
        passProps={{
          onClick: (e: React.MouseEvent) => {
            e.stopPropagation();
            onSelect(arrow.id, e.metaKey || e.ctrlKey, e.shiftKey);
          },
          style: {
            cursor: "pointer",
          }
        }}
      />
      
      {/* マージンサイズ調整用のコントロールポイント（選択時のみ表示） */}
      {isSelected && (
        <>
          {/* 開始点のマージンコントロール */}
          <div
            style={{
              position: "absolute",
              left: `${startMarginX + startMarginWidth - 4}px`,
              top: `${startMarginY + startMarginHeight / 2 - 4}px`,
              width: "8px",
              height: "8px",
              backgroundColor: "#4CAF50",
              borderRadius: "50%",
              cursor: "ew-resize",
              zIndex: arrow.zIndex + 1,
              border: "1px solid #fff",
            }}
            onMouseDown={handleStartOffsetMouseDown}
            title="開始点のマージンを調整"
          />
          
          {/* 終了点のマージンコントロール */}
          <div
            style={{
              position: "absolute",
              left: `${endMarginX + endMarginWidth - 4}px`,
              top: `${endMarginY + endMarginHeight / 2 - 4}px`,
              width: "8px",
              height: "8px",
              backgroundColor: "#FF9800",
              borderRadius: "50%",
              cursor: "ew-resize",
              zIndex: arrow.zIndex + 1,
              border: "1px solid #fff",
            }}
            onMouseDown={handleEndOffsetMouseDown}
            title="終了点のマージンを調整"
          />
        </>
      )}
    </>
  );
}