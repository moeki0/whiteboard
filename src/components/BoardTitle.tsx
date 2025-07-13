import React from "react";

interface BoardTitleProps {
  isEditingTitle: boolean;
  editingBoardName: string;
  boardName: string;
  onEditStart: () => void;
  onEditChange: (name: string) => void;
  onEditSave: () => void;
}

export function BoardTitle({
  isEditingTitle,
  editingBoardName,
  boardName,
  onEditStart,
  onEditChange,
  onEditSave,
}: BoardTitleProps) {
  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      onEditSave();
    }
  };

  if (isEditingTitle) {
    return (
      <input
        type="text"
        value={editingBoardName}
        onChange={(e) => onEditChange(e.target.value)}
        onKeyPress={handleKeyPress}
        onBlur={onEditSave}
        autoFocus
        className="board-title-input"
      />
    );
  }

  return (
    <p
      onClick={onEditStart}
      className="board-title"
      title="Click to edit"
    >
      {boardName}
    </p>
  );
}