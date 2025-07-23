import { useEffect, useRef, useState } from "react";
import { rtdb } from "../config/firebase";
import { ref, set, remove } from "firebase/database";
import { User } from "../types";
import { getUserProfile } from "../utils/userProfile";

interface UseCursorProps {
  boardId: string | undefined;
  user: User;
  sessionId: string;
  cursorColor: string;
  panX: number;
  panY: number;
  zoom: number;
}

export function useCursor({ boardId, user, sessionId, cursorColor, panX, panY, zoom }: UseCursorProps) {
  const throttleTimerRef = useRef<number | null>(null);
  const panXRef = useRef(panX);
  const panYRef = useRef(panY);
  const zoomRef = useRef(zoom);
  const [username, setUsername] = useState<string | null>(null);

  // Load username
  useEffect(() => {
    const loadUsername = async () => {
      if (user?.uid) {
        try {
          const profile = await getUserProfile(user.uid);
          setUsername(profile?.username || null);
        } catch (error) {
          console.error("Error loading user profile:", error);
          setUsername(null);
        }
      }
    };

    loadUsername();
  }, [user?.uid]);

  // Update refs when values change
  useEffect(() => {
    panXRef.current = panX;
    panYRef.current = panY;
    zoomRef.current = zoom;
  }, [panX, panY, zoom]);

  useEffect(() => {
    if (!boardId) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (throttleTimerRef.current) return;

      throttleTimerRef.current = window.setTimeout(() => {
        // Convert screen coordinates to board coordinates using refs
        const boardX = (e.clientX - panXRef.current) / zoomRef.current;
        const boardY = (e.clientY - panYRef.current) / zoomRef.current;

        const cursorRef = ref(rtdb, `boardCursors/${boardId}/${user.uid}-${sessionId}`);
        const userName = user.displayName || user.email || "User";
        const initials = userName
          .split(" ")
          .map((word) => word.charAt(0).toUpperCase())
          .slice(0, 2)
          .join("");

        set(cursorRef, {
          x: boardX,
          y: boardY,
          name: initials,
          fullName: `${userName} (${sessionId})`,
          color: cursorColor,
          timestamp: Date.now(),
          photoURL: user.photoURL,
          username: username,
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
        window.clearTimeout(throttleTimerRef.current);
      }
      
      cleanup();
    };
  }, [boardId, user.uid, sessionId, cursorColor, user.displayName, user.email]);
}