import React from "react";
import { Note } from "../types";
import "./LargeNoteOverlay.css";

interface LargeNoteOverlayProps {
  notes: Note[];
  zoom: number;
  panX: number;
  panY: number;
  onNoteClick?: (noteId: string) => void;
}

export function LargeNoteOverlay({
  notes,
  zoom,
  panX,
  panY,
  onNoteClick,
}: LargeNoteOverlayProps) {
  // ズームが0.3以下の時のみ表示
  const shouldShowOverlay = zoom <= 0.4;

  if (!shouldShowOverlay) {
    return null;
  }

  // 大文字付箋（先頭にアスタリスクがある）をフィルタリング
  const largeNotes = notes.filter((note) => {
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
  });

  if (largeNotes.length === 0) {
    return null;
  }

  return (
    <div className="large-note-overlay">
      {largeNotes.map((note) => {
        const content = note.content || "";
        const lines = content.split("\n").filter((line) => line.trim() !== "");
        const firstLine = lines[0].trim();
        const asteriskMatch = firstLine.match(/^(\*+)(.*)/);

        if (!asteriskMatch) return null;

        const displayText = asteriskMatch[2].trim() || content;

        // 画面上での実際の位置を計算
        const screenX = note.x * zoom + panX;
        const screenY = note.y * zoom + panY;

        // 画面内にあるかチェック
        const isVisible =
          screenX > -200 &&
          screenX < window.innerWidth + 200 &&
          screenY > -200 &&
          screenY < window.innerHeight + 200;

        if (!isVisible) return null;

        return (
          <div
            key={note.id}
            className="large-note-card"
            style={{
              left: screenX,
              top: screenY + 40,
              transform: `translate(-50%, -50%)`,
            }}
            onClick={() => onNoteClick?.(note.id)}
          >
            <div className="large-note-content">{displayText}</div>
          </div>
        );
      })}
    </div>
  );
}
