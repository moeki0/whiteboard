import React from "react";

interface SelectionBoxProps {
  isSelecting: boolean;
  selectionStart: { x: number; y: number } | null;
  selectionEnd: { x: number; y: number } | null;
}

export function SelectionBox({ isSelecting, selectionStart, selectionEnd }: SelectionBoxProps) {
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
}