import { useEffect, useRef } from "react";
import { rtdb } from "../config/firebase";
import { ref, set, remove } from "firebase/database";
import { User } from "../types";

interface UseCursorProps {
  boardId: string | undefined;
  user: User;
  sessionId: string;
  cursorColor: string;
}

export function useCursor({ boardId, user, sessionId, cursorColor }: UseCursorProps) {
  const throttleTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!boardId) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (throttleTimerRef.current) return;

      throttleTimerRef.current = setTimeout(() => {
        // Get scroll position to calculate relative cursor position
        const app = document.querySelector(".app") as HTMLElement;
        const scrollLeft = app?.scrollLeft || 0;
        const scrollTop = app?.scrollTop || 0;

        // Calculate cursor position relative to the board content
        const relativeX = e.clientX + scrollLeft;
        const relativeY = e.clientY + scrollTop;

        const cursorRef = ref(rtdb, `boardCursors/${boardId}/${user.uid}-${sessionId}`);
        const userName = user.displayName || user.email || "User";
        const initials = userName
          .split(" ")
          .map((word) => word.charAt(0).toUpperCase())
          .slice(0, 2)
          .join("");

        set(cursorRef, {
          x: relativeX,
          y: relativeY,
          name: initials,
          fullName: `${userName} (${sessionId})`,
          color: cursorColor,
          timestamp: Date.now(),
        }).catch((error) => {
          console.error("Error updating cursor:", error);
        });
        
        throttleTimerRef.current = null;
      }, 50); // Throttle to 20fps
    };

    document.addEventListener("mousemove", handleMouseMove);

    // Cleanup cursor on unmount or page close
    const cleanup = () => {
      const cursorRef = ref(rtdb, `boardCursors/${boardId}/${user.uid}-${sessionId}`);
      remove(cursorRef).catch((error) => {
        console.error("Error removing cursor:", error);
      });
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        cleanup();
      }
    };

    const handleBeforeUnload = () => {
      cleanup();
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("beforeunload", handleBeforeUnload);
      
      if (throttleTimerRef.current) {
        clearTimeout(throttleTimerRef.current);
      }
      
      cleanup();
    };
  }, [boardId, user.uid, sessionId, cursorColor, user.displayName, user.email]);
}