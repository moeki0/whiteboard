import React from "react";
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
  // 接続された付箋が存在するかチェック
  const startNote = notes.find(n => n.id === arrow.startNoteId);
  const endNote = notes.find(n => n.id === arrow.endNoteId);

  // 両方の付箋が存在しない場合は何も表示しない
  if (!startNote || !endNote) {
    return null;
  }

  const startId = `note-${arrow.startNoteId}`;
  const endId = `note-${arrow.endNoteId}`;

  return (
    <Xarrow
      start={startId}
      end={endId}
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
  );
}