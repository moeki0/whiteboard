import React from "react";
import { Board } from "../types";

interface BoardSuggestionsProps {
  boards: Board[];
  searchText: string;
  onSelectBoard: (boardName: string) => void;
  position: { x: number; y: number };
  isVisible: boolean;
  selectedIndex?: number;
}

// テキストハイライト用の関数
function highlightText(text: string, searchText: string): React.ReactNode {
  if (!searchText) return text;

  const regex = new RegExp(`(${searchText})`, "gi");
  const parts = text.split(regex);

  return parts.map((part, index) =>
    regex.test(part) ? (
      <span
        key={index}
        style={{
          backgroundColor: "#ffeb3b",
          color: "black",
          fontWeight: "bold",
        }}
      >
        {part}
      </span>
    ) : (
      part
    )
  );
}

export function BoardSuggestions({
  boards,
  searchText,
  isVisible,
  selectedIndex = 0,
}: BoardSuggestionsProps) {
  if (!isVisible || boards.length === 0) {
    return null;
  }

  const maxResults = 5; // 最大表示件数
  const displayBoards = boards.slice(0, maxResults);

  return (
    <div
      style={{
        position: "relative",
        left: 0,
        top: 0,
        borderRadius: "4px",
        boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
        display: "flex",
        color: "white",
        zIndex: 9999,
        fontSize: "12px",
        height: "auto",
        backgroundColor: "rgba(0,0,0,0.9)",
        border: "1px solid #ccc",
      }}
    >
      {displayBoards.map((board, index) => (
        <div
          key={board.id}
          style={{
            padding: "0 4px",
            textDecoration: index === selectedIndex ? "underline" : "none",
            backgroundColor: index === selectedIndex ? "#333" : "black",
            textWrap: "nowrap",
          }}
        >
          {highlightText(board.name, searchText)}
        </div>
      ))}
    </div>
  );
}
