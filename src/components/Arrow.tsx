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
  isSelected,
  onSelect,
  notes,
}: ArrowProps) {
  const [isReady, setIsReady] = useState(false);

  // 接続された付箋が存在するかチェック
  const startNote = notes.find(n => n.id === arrow.startNoteId);
  const endNote = notes.find(n => n.id === arrow.endNoteId);

  const startId = `note-${arrow.startNoteId}`;
  const endId = `note-${arrow.endNoteId}`;

  // 付箋のDOMが描画されるまで待機
  useEffect(() => {
    if (!startNote || !endNote) {
      return;
    }

    const checkElements = () => {
      const startElement = document.getElementById(startId);
      const endElement = document.getElementById(endId);
      
      if (startElement && endElement) {
        // 要素のサイズが確定するまで少し待つ
        setTimeout(() => {
          setIsReady(true);
        }, 50);
      }
    };

    // 初回チェック
    checkElements();

    // DOMの変更を監視
    const observer = new MutationObserver(checkElements);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['style', 'class']
    });

    return () => {
      observer.disconnect();
    };
  }, [startId, endId, startNote, endNote]);

  // 両方の付箋が存在しない場合は何も表示しない
  if (!startNote || !endNote) {
    return null;
  }

  // 付箋のDOMが準備できていない場合は何も表示しない
  if (!isReady) {
    return null;
  }

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