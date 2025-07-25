import "./StickyNoteCounter.css";
import { Project } from "../types";

interface StickyNoteCounterProps {
  noteCount: number;
  boardId: string | null;
  isPinned: boolean;
  canEdit: boolean;
  onPin: () => void;
  onDelete: () => void;
  project?: Project | null;
  boardName?: string;
  isMinimapOpen?: boolean;
  onToggleMinimap?: () => void;
}

export function StickyNoteCounter({
  noteCount,
  boardId,
  isPinned,
  canEdit,
  onPin,
  onDelete,
  isMinimapOpen,
  onToggleMinimap,
}: StickyNoteCounterProps) {
  if (!boardId || !canEdit) {
    return <div className="sticky-note-counter">{noteCount} Notes</div>;
  }

  return (
    <div className={`sticky-note-counter`}>
      <>
        <div className="counter-text">{noteCount} Notes</div>
        <div className="counter-actions">
          {onToggleMinimap && (
            <button
              className={`action-btn minimap-btn ${
                isMinimapOpen ? "active" : ""
              }`}
              onClick={onToggleMinimap}
              title={isMinimapOpen ? "Hide minimap" : "Show minimap"}
            >
              Minimap
            </button>
          )}
          <button
            className={`action-btn pin-btn ${isPinned ? "pinned" : ""}`}
            onClick={onPin}
            title={isPinned ? "Unpin board" : "Pin board"}
          >
            {isPinned ? "Unpin" : "Pin"}
          </button>
          <button
            className="action-btn"
            onClick={onDelete}
            title="Delete board"
          >
            Delete
          </button>
        </div>
      </>
    </div>
  );
}
