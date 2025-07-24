import React, { useCallback, useRef, useState, useEffect } from "react";
import { Note } from "../types";
import "./Minimap.css";

interface MinimapProps {
  notes: Note[];
  viewportX: number;
  viewportY: number;
  viewportWidth: number;
  viewportHeight: number;
  zoom: number;
  onViewportChange: (x: number, y: number) => void;
  unreadNoteIds?: Set<string>;
}

const MINIMAP_WIDTH = 200;
const MINIMAP_HEIGHT = 150;
const MINIMAP_SCALE = 0.1; // ミニマップのスケール

export function Minimap({
  notes,
  viewportX,
  viewportY,
  viewportWidth,
  viewportHeight,
  zoom,
  onViewportChange,
  unreadNoteIds = new Set<string>(),
}: MinimapProps) {
  const minimapRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isVisible, setIsVisible] = useState(false);

  // マウント時にアニメーションを開始
  useEffect(() => {
    const timer = setTimeout(() => {
      setIsVisible(true);
    }, 10);
    return () => clearTimeout(timer);
  }, []);

  // 大文字付箋を検出する関数
  const isLargeNote = useCallback((note: Note) => {
    const content = note.content || "";
    const lines = content.split("\n").filter((line) => line.trim() !== "");
    if (lines.length === 0) return false;

    const firstLine = lines[0].trim();

    // 画像・動画URLパターンを除外
    const isMediaUrl =
      /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(firstLine) ||
      firstLine.includes("gyazo.com") ||
      firstLine.includes("imgur.com") ||
      firstLine.includes("youtube.com") ||
      firstLine.includes("youtu.be") ||
      firstLine.includes("image");

    if (isMediaUrl) return false;

    // 先頭アスタリスクパターンをチェック
    const asteriskMatch = firstLine.match(/^(\*+)(.*)/);
    if (!asteriskMatch || asteriskMatch[1].length === 0) return false;

    // アスタリスク後のコンテンツが画像・動画URLでないかチェック
    const contentAfterAsterisk = asteriskMatch[2].trim();
    const isContentMedia =
      /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(contentAfterAsterisk) ||
      contentAfterAsterisk.includes("gyazo.com") ||
      contentAfterAsterisk.includes("imgur.com") ||
      contentAfterAsterisk.includes("youtube.com") ||
      contentAfterAsterisk.includes("youtu.be");

    return !isContentMedia;
  }, []);

  // ボード座標系での境界を計算
  const getBounds = useCallback(() => {
    if (notes.length === 0) {
      return {
        minX: -viewportWidth / zoom,
        maxX: viewportWidth / zoom,
        minY: -viewportHeight / zoom,
        maxY: viewportHeight / zoom,
      };
    }

    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;

    notes.forEach((note) => {
      const noteWidth = parseInt(note.width) || 160;
      const noteHeight = 41.5; // 付箋のデフォルト高さ
      minX = Math.min(minX, note.x);
      maxX = Math.max(maxX, note.x + noteWidth);
      minY = Math.min(minY, note.y);
      maxY = Math.max(maxY, note.y + noteHeight);
    });

    // 現在のビューポートも含める
    const viewportMinX = -viewportX / zoom;
    const viewportMaxX = (-viewportX + viewportWidth) / zoom;
    const viewportMinY = -viewportY / zoom;
    const viewportMaxY = (-viewportY + viewportHeight) / zoom;

    minX = Math.min(minX, viewportMinX);
    maxX = Math.max(maxX, viewportMaxX);
    minY = Math.min(minY, viewportMinY);
    maxY = Math.max(maxY, viewportMaxY);

    // マージンを追加
    const margin = 100;
    return {
      minX: minX - margin,
      maxX: maxX + margin,
      minY: minY - margin,
      maxY: maxY + margin,
    };
  }, [notes, viewportX, viewportY, viewportWidth, viewportHeight, zoom]);

  const bounds = getBounds();
  const boundsWidth = bounds.maxX - bounds.minX;
  const boundsHeight = bounds.maxY - bounds.minY;

  // ミニマップ内での座標変換
  const boardToMinimap = useCallback(
    (boardX: number, boardY: number) => {
      const minimapX = ((boardX - bounds.minX) / boundsWidth) * MINIMAP_WIDTH;
      const minimapY = ((boardY - bounds.minY) / boundsHeight) * MINIMAP_HEIGHT;
      return { x: minimapX, y: minimapY };
    },
    [bounds, boundsWidth, boundsHeight]
  );

  const minimapToBoard = useCallback(
    (minimapX: number, minimapY: number) => {
      const boardX = (minimapX / MINIMAP_WIDTH) * boundsWidth + bounds.minX;
      const boardY = (minimapY / MINIMAP_HEIGHT) * boundsHeight + bounds.minY;
      return { x: boardX, y: boardY };
    },
    [bounds, boundsWidth, boundsHeight]
  );

  // ビューポート矩形の座標とサイズを計算
  const viewportRect = {
    ...boardToMinimap(-viewportX / zoom, -viewportY / zoom),
    width: (viewportWidth / zoom / boundsWidth) * MINIMAP_WIDTH,
    height: (viewportHeight / zoom / boundsHeight) * MINIMAP_HEIGHT,
  };

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      setIsDragging(true);

      const rect = minimapRef.current?.getBoundingClientRect();
      if (!rect) return;

      const minimapX = e.clientX - rect.left;
      const minimapY = e.clientY - rect.top;
      const boardPos = minimapToBoard(minimapX, minimapY);

      // ビューポートの中心をクリック位置に移動
      const newViewportX = -(boardPos.x - viewportWidth / zoom / 2) * zoom;
      const newViewportY = -(boardPos.y - viewportHeight / zoom / 2) * zoom;

      onViewportChange(newViewportX, newViewportY);
    },
    [minimapToBoard, viewportWidth, viewportHeight, zoom, onViewportChange]
  );

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!isDragging) return;

      const rect = minimapRef.current?.getBoundingClientRect();
      if (!rect) return;

      const minimapX = e.clientX - rect.left;
      const minimapY = e.clientY - rect.top;
      const boardPos = minimapToBoard(minimapX, minimapY);

      // ビューポートの中心をマウス位置に移動
      const newViewportX = -(boardPos.x - viewportWidth / zoom / 2) * zoom;
      const newViewportY = -(boardPos.y - viewportHeight / zoom / 2) * zoom;

      onViewportChange(newViewportX, newViewportY);
    },
    [
      isDragging,
      minimapToBoard,
      viewportWidth,
      viewportHeight,
      zoom,
      onViewportChange,
    ]
  );

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  // グローバルマウスイベントリスナー
  React.useEffect(() => {
    if (isDragging) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
      return () => {
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
      };
    }
  }, [isDragging, handleMouseMove, handleMouseUp]);

  return (
    <div
      data-testid="minimap"
      className="minimap"
      ref={minimapRef}
      onMouseDown={handleMouseDown}
      style={{
        position: "fixed",
        bottom: "36px",
        left: "8px",
        width: `${MINIMAP_WIDTH}px`,
        height: `${MINIMAP_HEIGHT}px`,
        backgroundColor: "rgba(255, 255, 255, 0.9)",
        border: "1px solid #ccc",
        borderRadius: "4px",
        cursor: isDragging ? "grabbing" : "grab",
        zIndex: 1000,
        overflow: "hidden",
        boxShadow: "0 2px 8px rgba(0, 0, 0, 0.15)",
      }}
    >
      {/* 付箋を表示 */}
      {notes.map((note) => {
        const notePos = boardToMinimap(note.x, note.y);
        const noteWidth = parseInt(note.width) || 160;
        const noteHeight = 41.5; // 付箋のデフォルト高さ
        const isLarge = isLargeNote(note);
        const isUnread = unreadNoteIds.has(note.id);

        // 大文字付箋は大きく、通常の付箋は小さく表示
        const displaySize = isLarge ? 1.5 : 1; // 大文字付箋は1.5倍
        const noteSize = {
          width: Math.max(
            isLarge ? 4 : 2,
            (noteWidth / boundsWidth) * MINIMAP_WIDTH * displaySize
          ),
          height: Math.max(
            isLarge ? 4 : 2,
            (noteHeight / boundsHeight) * MINIMAP_HEIGHT * displaySize
          ),
        };

        return (
          <div
            key={note.id}
            style={{
              position: "absolute",
              left: `${notePos.x}px`,
              top: `${notePos.y}px`,
              width: `${noteSize.width}px`,
              height: `${noteSize.height}px`,
              backgroundColor: isLarge ? "#333" : note.color || "#ffeb3b",
              border: isLarge ? "1px solid #333" : "0.5px solid #ccc",
              borderRadius: isLarge ? "2px" : "1px",
              zIndex: isLarge ? 10 : 1,
            }}
          >
            {/* 未読マーク */}
            {isUnread && (
              <div
                style={{
                  position: "absolute",
                  top: "-2px",
                  right: "-2px",
                  width: "4px",
                  height: "4px",
                  backgroundColor: "#4caf50",
                  borderRadius: "50%",
                  border: "0.5px solid #fff",
                  zIndex: 20,
                }}
              />
            )}
          </div>
        );
      })}

      {/* ビューポート矩形 */}
      <div
        style={{
          position: "absolute",
          left: `${viewportRect.x}px`,
          top: `${viewportRect.y}px`,
          width: `${viewportRect.width}px`,
          height: `${viewportRect.height}px`,
          border: "2px solid #007acc",
          backgroundColor: "rgba(0, 122, 204, 0.1)",
          pointerEvents: "none",
          zIndex: 100,
        }}
      />
    </div>
  );
}
