import { LuMousePointer2 } from "react-icons/lu";
import { Cursor } from "../types";

interface BoardListCursorDisplayProps {
  cursors: Record<string, Cursor>;
}

export function BoardListCursorDisplay({ cursors }: BoardListCursorDisplayProps) {
  // Debug: Log cursor data
  console.log('BoardListCursorDisplay - cursors:', cursors);
  
  return (
    <>
      {Object.entries(cursors).map(([cursorId, cursor]) => {
        console.log('Rendering cursor:', cursorId, cursor);
        return (
        <div
          key={cursorId}
          className="cursor"
          style={{
            left: `${cursor.x}px`,
            top: `${cursor.y}px`,
            position: "fixed", // Use fixed positioning for board list cursors
            pointerEvents: "none",
            zIndex: 10000,
          }}
        >
          <div className="cursor-pointer">
            <LuMousePointer2
              style={{
                color: cursor.color || "#ff4444",
                fill: cursor.color || "#ff4444",
              }}
            />
          </div>
          <div
            className="cursor-label"
            style={{
              backgroundColor: cursor.color || "#ff4444",
            }}
            title={cursor.fullName}
          >
            {cursor.name}
          </div>
        </div>
        );
      })}
    </>
  );
}