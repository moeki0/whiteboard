import React, { useState, useEffect } from "react";
import { Arrow as ArrowType, Note } from "../types";

interface ArrowSVGProps {
  arrow: ArrowType;
  onUpdate: (arrowId: string, updates: Partial<ArrowType>) => void;
  isSelected: boolean;
  onSelect: (arrowId: string, isMultiSelect: boolean, isShiftSelect: boolean) => void;
  zoom: number;
  notes: Note[];
}

export function ArrowSVG({
  arrow,
  isSelected,
  onSelect,
  zoom,
  notes,
}: ArrowSVGProps) {
  const [isReady, setIsReady] = useState(false);

  // 接続された付箋を取得
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

  // 付箋のサイズを取得
  const getNoteSize = (noteId: string) => {
    const noteElement = document.getElementById(`note-${noteId}`);
    if (noteElement) {
      const rect = noteElement.getBoundingClientRect();
      // transformを考慮して実際のサイズを計算
      return {
        width: rect.width / zoom,
        height: rect.height / zoom
      };
    }
    // フォールバック
    return { width: 200, height: 150 };
  };

  const startNoteSize = getNoteSize(startNote.id);
  const endNoteSize = getNoteSize(endNote.id);

  // アンカーポイントの計算
  const getAnchorPoint = (note: Note, noteSize: { width: number; height: number }, anchor: string, otherNote: Note) => {
    const centerX = note.x + noteSize.width / 2;
    const centerY = note.y + noteSize.height / 2;
    const otherCenterX = otherNote.x + getNoteSize(otherNote.id).width / 2;
    const otherCenterY = otherNote.y + getNoteSize(otherNote.id).height / 2;

    // 付箋の実際のボックス
    const boxX = note.x;
    const boxY = note.y;
    const boxWidth = noteSize.width;
    const boxHeight = noteSize.height;
    const boxCenterX = boxX + boxWidth / 2;
    const boxCenterY = boxY + boxHeight / 2;

    if (anchor === 'auto') {
      // 相手の付箋との角度を計算
      const angle = Math.atan2(otherCenterY - centerY, otherCenterX - centerX);
      
      // 矩形の境界上の点を計算
      const halfWidth = boxWidth / 2;
      const halfHeight = boxHeight / 2;
      
      // 角度に基づいて矩形の辺上の点を計算
      let intersectX, intersectY;
      
      // 矩形の各辺との交点を計算
      const tan = Math.tan(angle);
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      
      if (Math.abs(cos) > Math.abs(sin)) {
        // 左右の辺と交差
        if (cos > 0) {
          // 右辺
          intersectX = boxCenterX + halfWidth;
          intersectY = boxCenterY + halfWidth * tan;
        } else {
          // 左辺
          intersectX = boxCenterX - halfWidth;
          intersectY = boxCenterY - halfWidth * tan;
        }
        
        // Y座標が矩形の範囲を超える場合は上下の辺と交差
        if (Math.abs(intersectY - boxCenterY) > halfHeight) {
          if (sin > 0) {
            // 下辺
            intersectY = boxCenterY + halfHeight;
            intersectX = boxCenterX + halfHeight / tan;
          } else {
            // 上辺
            intersectY = boxCenterY - halfHeight;
            intersectX = boxCenterX - halfHeight / tan;
          }
        }
      } else {
        // 上下の辺と交差
        if (sin > 0) {
          // 下辺
          intersectY = boxCenterY + halfHeight;
          intersectX = boxCenterX + halfHeight / tan;
        } else {
          // 上辺
          intersectY = boxCenterY - halfHeight;
          intersectX = boxCenterX - halfHeight / tan;
        }
        
        // X座標が矩形の範囲を超える場合は左右の辺と交差
        if (Math.abs(intersectX - boxCenterX) > halfWidth) {
          if (cos > 0) {
            // 右辺
            intersectX = boxCenterX + halfWidth;
            intersectY = boxCenterY + halfWidth * tan;
          } else {
            // 左辺
            intersectX = boxCenterX - halfWidth;
            intersectY = boxCenterY - halfWidth * tan;
          }
        }
      }
      
      return { x: intersectX, y: intersectY };
    }

    // 固定アンカーの場合
    switch (anchor) {
      case 'left':
        return { x: boxX, y: boxCenterY };
      case 'right':
        return { x: boxX + boxWidth, y: boxCenterY };
      case 'top':
        return { x: boxCenterX, y: boxY };
      case 'bottom':
        return { x: boxCenterX, y: boxY + boxHeight };
      default:
        return { x: boxCenterX, y: boxCenterY };
    }
  };

  const startAnchor = arrow.startAnchor || 'auto';
  const endAnchor = arrow.endAnchor || 'auto';

  // 開始点と終了点の計算
  const startPoint = getAnchorPoint(startNote, startNoteSize, startAnchor, endNote);
  const endPoint = getAnchorPoint(endNote, endNoteSize, endAnchor, startNote);

  const startX = startPoint.x;
  const startY = startPoint.y;
  const endX = endPoint.x;
  const endY = endPoint.y;

  // ベジェ曲線の制御点を計算
  const dx = endX - startX;
  const dy = endY - startY;
  const curvature = 0.3;
  
  // 制御点1（開始点の右側）
  const cp1x = startX + dx * curvature;
  const cp1y = startY;
  
  // 制御点2（終了点の左側）
  const cp2x = endX - dx * curvature;
  const cp2y = endY;

  // 矢印の頭の計算
  const arrowHeadLength = 10;
  const arrowHeadAngle = Math.PI / 6; // 30度

  // ベジェ曲線の終点での接線方向を正しく計算
  // 3次ベジェ曲線 B(t) = (1-t)³P₀ + 3(1-t)²tP₁ + 3(1-t)t²P₂ + t³P₃
  // 微分 B'(t) = 3(1-t)²(P₁-P₀) + 6(1-t)t(P₂-P₁) + 3t²(P₃-P₂)
  // t=1での接線: B'(1) = 3(P₃-P₂)
  const tangentX = endX - cp2x;
  const tangentY = endY - cp2y;
  
  // 接線が非常に小さい場合は、制御点2と制御点1の方向を使用
  const tangentLength = Math.sqrt(tangentX * tangentX + tangentY * tangentY);
  let finalTangentX = tangentX;
  let finalTangentY = tangentY;
  
  if (tangentLength < 1) {
    // cp2とcp1の方向を使用
    finalTangentX = cp2x - cp1x;
    finalTangentY = cp2y - cp1y;
    const cp2cp1Length = Math.sqrt(finalTangentX * finalTangentX + finalTangentY * finalTangentY);
    
    if (cp2cp1Length < 1) {
      // それでも小さい場合は直線の方向を使用
      finalTangentX = dx;
      finalTangentY = dy;
    }
  }
  
  const angle = Math.atan2(finalTangentY, finalTangentX);

  // 矢印の頭の2つの点を計算（矢印の先端から後ろに向かって）
  const arrowHead1X = endX - arrowHeadLength * Math.cos(angle - arrowHeadAngle);
  const arrowHead1Y = endY - arrowHeadLength * Math.sin(angle - arrowHeadAngle);
  const arrowHead2X = endX - arrowHeadLength * Math.cos(angle + arrowHeadAngle);
  const arrowHead2Y = endY - arrowHeadLength * Math.sin(angle + arrowHeadAngle);

  // SVGパスの定義
  const pathData = `M ${startX} ${startY} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${endX} ${endY}`;
  const arrowHeadData = `M ${arrowHead1X} ${arrowHead1Y} L ${endX} ${endY} L ${arrowHead2X} ${arrowHead2Y}`;

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onSelect(arrow.id, e.metaKey || e.ctrlKey, e.shiftKey);
  };


  return (
    <g style={{ cursor: "pointer" }}>
      {/* メインの線 */}
      <path
        d={pathData}
        fill="none"
        stroke={isSelected ? "#2196F3" : "#666"}
        strokeWidth={isSelected ? 3 : 2}
        onClick={handleClick}
      />
      
      {/* クリック判定用の透明な太い線 */}
      <path
        d={pathData}
        fill="none"
        stroke="transparent"
        strokeWidth={20}
        onClick={handleClick}
      />
      
      {/* 矢印の頭 */}
      <path
        d={arrowHeadData}
        fill="none"
        stroke={isSelected ? "#2196F3" : "#666"}
        strokeWidth={isSelected ? 3 : 2}
        strokeLinejoin="round"
        onClick={handleClick}
      />
    </g>
  );
}