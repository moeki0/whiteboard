import React from "react";
import { Board } from "../types";
import { SuggestionItem } from "../utils/textCompletion";
import { LoadingSpinner } from "./LoadingSpinner";

interface BoardSuggestionsProps {
  boards: Board[];
  searchText: string;
  onSelectBoard: (boardName: string) => void;
  position: { x: number; y: number };
  isVisible: boolean;
  selectedIndex?: number;
}

interface CombinedSuggestionsProps {
  suggestions: SuggestionItem[];
  searchText: string;
  onSelectSuggestion: (title: string, type: 'board' | 'scrapbox') => void;
  position: { x: number; y: number };
  isVisible: boolean;
  selectedIndex?: number;
  isLoading?: boolean;
  error?: string | null;
}

// テキストハイライト用の関数
function highlightText(text: string, searchText: string): React.ReactNode {
  // textが文字列でない場合は文字列に変換
  const textString = String(text || '');
  
  if (!searchText || !textString) return textString;

  try {
    const regex = new RegExp(`(${searchText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, "gi");
    const parts = textString.split(regex);

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
  } catch (error) {
    // 正規表現エラーの場合は元のテキストをそのまま返す
    console.warn('highlightText regex error:', error);
    return textString;
  }
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

export function CombinedSuggestions({
  suggestions,
  searchText,
  isVisible,
  selectedIndex = 0,
  isLoading = false,
  error = null,
}: CombinedSuggestionsProps) {
  if (!isVisible) {
    return null;
  }

  const baseStyle = {
    position: "relative" as const,
    left: 0,
    top: 0,
    borderRadius: "4px",
    boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
    display: "flex",
    flexDirection: "column" as const,
    color: "white",
    zIndex: 9999,
    fontSize: "12px",
    height: "auto",
    backgroundColor: "rgba(0,0,0,0.9)",
    border: "1px solid #ccc",
    minWidth: "200px",
  };

  // ローディング表示
  if (isLoading) {
    return (
      <div style={baseStyle}>
        <div
          style={{
            padding: "8px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "8px",
          }}
        >
          <LoadingSpinner size={12} color="#ffffff" />
          <span style={{ opacity: 0.8 }}>検索中...</span>
        </div>
      </div>
    );
  }

  // エラー表示
  if (error) {
    return (
      <div style={baseStyle}>
        <div
          style={{
            padding: "8px",
            color: "#ff6b6b",
            textAlign: "center",
          }}
        >
          検索エラー: {error}
        </div>
      </div>
    );
  }

  // 候補がない場合
  if (suggestions.length === 0) {
    return (
      <div style={baseStyle}>
        <div
          style={{
            padding: "8px",
            color: "#999",
            textAlign: "center",
            opacity: 0.8,
          }}
        >
          候補が見つかりません
        </div>
      </div>
    );
  }

  const maxResults = 8; // 最大表示件数
  const displaySuggestions = suggestions.slice(0, maxResults);

  return (
    <div style={baseStyle}>
      {displaySuggestions.map((suggestion, index) => (
        <div
          key={`${suggestion.type}-${suggestion.title}`}
          style={{
            padding: "4px 8px",
            textDecoration: index === selectedIndex ? "underline" : "none",
            backgroundColor: index === selectedIndex ? "#333" : "black",
            borderBottom: index < displaySuggestions.length - 1 ? "1px solid #444" : "none",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span style={{ flex: 1 }}>
            {highlightText(suggestion.title || '', searchText)}
          </span>
          <span
            style={{
              fontSize: "10px",
              color: suggestion.type === 'board' ? "#4CAF50" : "#2196F3",
              marginLeft: "8px",
              opacity: 0.8,
            }}
          >
            {suggestion.type === 'board' ? 'Board' : 'Scrapbox'}
          </span>
        </div>
      ))}
    </div>
  );
}
