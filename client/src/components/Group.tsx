import React, { useState } from "react";
import { Group as GroupType, Note } from "../types";
import { calculateNoteDimensions } from "../utils/noteUtils";

interface GroupProps {
  group: GroupType;
  notes: Note[];
  onSelect: (
    groupId: string,
    isMultiSelect?: boolean,
    isShiftSelect?: boolean
  ) => void;
  isSelected: boolean;
  zoom?: number;
  onUpdate?: (groupId: string, updates: Partial<GroupType>) => void;
  onDelete?: (groupId: string) => void;
  onStartGroupDrag?: (groupId: string, e: React.MouseEvent<SVGElement>) => void;
}

// 凸包を計算する関数（Andrew's monotone chain algorithm）
function convexHull(
  points: Array<{ x: number; y: number }>
): Array<{ x: number; y: number }> {
  if (points.length <= 1) return points;

  // x座標でソート
  const sorted = points.slice().sort((a, b) => a.x - b.x || a.y - b.y);

  // 下半分の凸包を構築
  const lower: Array<{ x: number; y: number }> = [];
  for (const point of sorted) {
    while (
      lower.length >= 2 &&
      cross(lower[lower.length - 2], lower[lower.length - 1], point) <= 0
    ) {
      lower.pop();
    }
    lower.push(point);
  }

  // 上半分の凸包を構築
  const upper: Array<{ x: number; y: number }> = [];
  for (let i = sorted.length - 1; i >= 0; i--) {
    const point = sorted[i];
    while (
      upper.length >= 2 &&
      cross(upper[upper.length - 2], upper[upper.length - 1], point) <= 0
    ) {
      upper.pop();
    }
    upper.push(point);
  }

  // 最後の点は重複するので削除
  lower.pop();
  upper.pop();

  return lower.concat(upper);
}

// 外積を計算（反時計回りかどうかを判定）
function cross(
  o: { x: number; y: number },
  a: { x: number; y: number },
  b: { x: number; y: number }
): number {
  return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
}

// ポイントを滑らかな曲線で繋ぐためのCatmull-Rom spline
function createSmoothPath(
  points: Array<{ x: number; y: number }>,
  tension: number = 0.3
): string {
  if (points.length < 3) {
    // 点が少ない場合は角丸四角形で繋ぐ
    if (points.length === 2) {
      // 2点の場合は楕円形に近い形状を作る
      const [p1, p2] = points;
      const centerX = (p1.x + p2.x) / 2;
      const centerY = (p1.y + p2.y) / 2;
      const radiusX = Math.abs(p2.x - p1.x) / 2 + 10;
      const radiusY = Math.abs(p2.y - p1.y) / 2 + 10;

      return `M ${centerX - radiusX} ${centerY} 
              Q ${centerX - radiusX} ${centerY - radiusY} ${centerX} ${
        centerY - radiusY
      }
              Q ${centerX + radiusX} ${centerY - radiusY} ${
        centerX + radiusX
      } ${centerY}
              Q ${centerX + radiusX} ${centerY + radiusY} ${centerX} ${
        centerY + radiusY
      }
              Q ${centerX - radiusX} ${centerY + radiusY} ${
        centerX - radiusX
      } ${centerY} Z`;
    }
    return (
      points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ") +
      " Z"
    );
  }

  let path = `M ${points[0].x} ${points[0].y}`;

  for (let i = 0; i < points.length; i++) {
    const p0 = points[(i - 1 + points.length) % points.length];
    const p1 = points[i];
    const p2 = points[(i + 1) % points.length];
    const p3 = points[(i + 2) % points.length];

    // 制御点を計算（より控えめに）
    const cp1x = p1.x + (p2.x - p0.x) * tension;
    const cp1y = p1.y + (p2.y - p0.y) * tension;
    const cp2x = p2.x - (p3.x - p1.x) * tension;
    const cp2y = p2.y - (p3.y - p1.y) * tension;

    path += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`;
  }

  return path + " Z";
}

const GroupComponent = function Group({
  group,
  notes,
  onSelect,
  isSelected,
  zoom = 1,
  onStartGroupDrag,
}: GroupProps) {
  const [isHovered, setIsHovered] = useState(false);

  // グループ内の付箋を取得
  const groupNotes = notes.filter((note) => group.noteIds.includes(note.id));

  if (groupNotes.length === 0) {
    return null;
  }

  // 付箋の各角の座標を取得
  const noteCorners: Array<{ x: number; y: number }> = [];
  const margin = 15; // マージンを小さくして適切なサイズに

  groupNotes.forEach((note) => {
    // DOM要素から実際のサイズを取得
    const noteElement = document.querySelector(
      `[data-note-id="${note.id}"]`
    ) as HTMLElement;
    let noteWidth = 160; // デフォルト値
    let noteHeight = 50; // デフォルト値

    if (noteElement) {
      const rect = noteElement.getBoundingClientRect();
      // ズームを考慮してサイズを調整
      noteWidth = rect.width / zoom;
      noteHeight = rect.height / zoom;
    } else {
      // DOM要素が見つからない場合は計算値を使用
      const dimensions = calculateNoteDimensions(note);
      noteWidth = dimensions.width;
      noteHeight = dimensions.height;
    }

    // 各付箋の4つの角にマージンを加えた点を追加
    noteCorners.push(
      { x: note.x - margin, y: note.y - margin }, // 左上
      { x: note.x + noteWidth + margin, y: note.y - margin }, // 右上
      { x: note.x + noteWidth + margin, y: note.y + noteHeight + margin }, // 右下
      { x: note.x - margin, y: note.y + noteHeight + margin } // 左下
    );
  });

  // 凸包を計算
  const hull = convexHull(noteCorners);

  if (hull.length === 0) return null;

  // 全体のバウンディングボックスを計算
  const minX = Math.min(...hull.map((p) => p.x));
  const minY = Math.min(...hull.map((p) => p.y));
  const maxX = Math.max(...hull.map((p) => p.x));
  const maxY = Math.max(...hull.map((p) => p.y));

  // 曲線のはみ出しを考慮してSVGサイズを拡張
  const svgPadding = 30; // 曲線のはみ出し分のパディング
  const svgMinX = minX - svgPadding;
  const svgMinY = minY - svgPadding;
  const svgWidth = maxX - minX + svgPadding * 2;
  const svgHeight = maxY - minY + svgPadding * 2;

  // SVG座標系に変換（相対座標、パディングを考慮）
  const relativeHull = hull.map((p) => ({
    x: p.x - svgMinX,
    y: p.y - svgMinY,
  }));

  // 滑らかなパスを生成（テンションを小さくして控えめな曲線に）
  const smoothPath = createSmoothPath(relativeHull, 0.1);

  const handleClick = (e: React.MouseEvent<SVGElement>) => {
    e.stopPropagation();
    const isCommandClick = e.ctrlKey || e.metaKey;
    const isShiftClick = e.shiftKey;
    onSelect(group.id, isCommandClick && !isShiftClick, isShiftClick);
  };

  const handleMouseDown = (e: React.MouseEvent<SVGElement>) => {
    e.stopPropagation();

    // 右クリックは無視
    if (e.button !== 0) return;

    // ドラッグ開始
    if (onStartGroupDrag) {
      onStartGroupDrag(group.id, e);
    }
  };

  return (
    <div
      style={{
        position: "absolute",
        left: `${svgMinX}px`,
        top: `${svgMinY}px`,
        width: `${svgWidth}px`,
        height: `${svgHeight}px`,
        pointerEvents: "none",
        zIndex: -1, // 付箋より後ろに表示
      }}
    >
      <svg
        width={svgWidth}
        height={svgHeight}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          pointerEvents: "auto",
          cursor: "pointer",
        }}
        onClick={handleClick}
        onMouseDown={handleMouseDown}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        {/* 背景の影 */}
        <defs>
          <filter
            id={`shadow-${group.id}`}
            x="-20%"
            y="-20%"
            width="140%"
            height="140%"
          >
            <feDropShadow
              dx="2"
              dy="2"
              stdDeviation="3"
              floodColor="rgba(0,0,0,0.1)"
            />
          </filter>
          <filter
            id={`shadow-hover-${group.id}`}
            x="-20%"
            y="-20%"
            width="140%"
            height="140%"
          >
            <feDropShadow
              dx="3"
              dy="3"
              stdDeviation="5"
              floodColor="rgba(0,0,0,0.15)"
            />
          </filter>
          <linearGradient
            id={`gradient-${group.id}`}
            x1="0%"
            y1="0%"
            x2="100%"
            y2="100%"
          >
            <stop
              offset="0%"
              stopColor={group.color || "rgba(91, 151, 255, 0.15)"}
            />
            <stop
              offset="100%"
              stopColor={group.color || "rgba(91, 151, 255, 0.05)"}
            />
          </linearGradient>
          <linearGradient
            id={`gradient-hover-${group.id}`}
            x1="0%"
            y1="0%"
            x2="100%"
            y2="100%"
          >
            <stop
              offset="0%"
              stopColor={group.color || "rgba(91, 151, 255, 0.3)"}
            />
            <stop
              offset="100%"
              stopColor={group.color || "rgba(91, 151, 255, 0.15)"}
            />
          </linearGradient>
        </defs>

        <path
          d={smoothPath}
          fill={
            isHovered
              ? `url(#gradient-hover-${group.id})`
              : `url(#gradient-${group.id})`
          }
          stroke={
            isSelected
              ? "#5b97ff"
              : isHovered
              ? "#5b97ff"
              : "rgba(91, 151, 255, 0.4)"
          }
          strokeWidth={isSelected ? 3 : isHovered ? 2.5 : 2}
          strokeDasharray={isSelected ? "none" : "8,4"}
          filter={
            isHovered
              ? `url(#shadow-hover-${group.id})`
              : `url(#shadow-${group.id})`
          }
          style={{
            transition: "all 0.2s ease-in-out",
            cursor: "pointer",
          }}
        />
      </svg>

      {/* グループ名表示 */}
      {group.name && (
        <div
          style={{
            position: "absolute",
            top: -25,
            left: svgPadding + 15, // パディングを考慮した位置調整
            fontSize: "11px",
            color: "#555",
            backgroundColor: "rgba(255, 255, 255, 0.95)",
            padding: "3px 8px",
            borderRadius: "6px",
            pointerEvents: "none",
            boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
            border: "1px solid rgba(91, 151, 255, 0.2)",
          }}
        >
          {group.name}
        </div>
      )}
    </div>
  );
};

export const Group = React.memo(GroupComponent);
