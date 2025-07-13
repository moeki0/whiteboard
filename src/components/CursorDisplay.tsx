import React from "react";
import { LuMousePointer2 } from "react-icons/lu";
import { Cursor } from "../types";

interface CursorDisplayProps {
  cursors: Record<string, Cursor>;
}

export function CursorDisplay({ cursors }: CursorDisplayProps) {
  return (
    <>
      {Object.entries(cursors).map(([cursorId, cursor]) => (
        <div
          key={cursorId}
          className="cursor"
          style={{
            left: `${cursor.x}px`,
            top: `${cursor.y}px`,
            position: "absolute",
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
      ))}
    </>
  );
}