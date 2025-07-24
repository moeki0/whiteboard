import React from "react";
import { Note } from "../types";

interface UnreadNoteIndicatorProps {
  unreadNotes: Note[];
  onFocusNote: (noteId: string) => void;
  zoom: number;
}

export const UnreadNoteIndicator: React.FC<UnreadNoteIndicatorProps> = ({
  unreadNotes,
  onFocusNote,
  zoom,
}) => {
  // ズームレベルが0.3以下の時のみ表示
  if (zoom > 0.3) {
    return null;
  }

  if (unreadNotes.length === 0) {
    return null;
  }

  // 近い位置にある未読付箋をグループ化
  const groupedNotes = groupNearbyNotes(unreadNotes, 50 / zoom);

  return (
    <>
      {groupedNotes.map((group, index) => (
        <UnreadIndicatorDot
          key={index}
          notes={group}
          onFocusNote={onFocusNote}
          zoom={zoom}
        />
      ))}
    </>
  );
};

interface UnreadIndicatorDotProps {
  notes: Note[];
  onFocusNote: (noteId: string) => void;
  zoom: number;
}

const UnreadIndicatorDot: React.FC<UnreadIndicatorDotProps> = ({
  notes,
  onFocusNote,
  zoom,
}) => {
  const firstNote = notes[0];
  const count = notes.length;

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    // 複数の場合は最初の付箋にフォーカス
    onFocusNote(firstNote.id);
  };

  const dotSize = Math.max(16, 24 / zoom);

  return (
    <div
      className="unread-indicator-container"
      style={{
        left: firstNote.x,
        top: firstNote.y,
        zIndex: 999999,
      }}
      onClick={handleClick}
    >
      <div
        className="unread-indicator-dot"
        style={{
          width: dotSize,
          height: dotSize,
          fontSize: Math.max(8, 10 / zoom),
        }}
      >
        {count}
      </div>
    </div>
  );
};

// 近い位置にある付箋をグループ化する関数
function groupNearbyNotes(notes: Note[], threshold: number): Note[][] {
  const groups: Note[][] = [];
  const processed = new Set<string>();

  notes.forEach((note) => {
    if (processed.has(note.id)) return;

    const group = [note];
    processed.add(note.id);

    // 他の付箋との距離をチェック
    notes.forEach((otherNote) => {
      if (processed.has(otherNote.id)) return;

      const distance = Math.sqrt(
        Math.pow(note.x - otherNote.x, 2) + Math.pow(note.y - otherNote.y, 2)
      );

      if (distance <= threshold) {
        group.push(otherNote);
        processed.add(otherNote.id);
      }
    });

    groups.push(group);
  });

  return groups;
}
