import { useEffect, useRef, useState } from "react";
import { rtdb } from "../config/firebase";
import { ref, set, remove } from "firebase/database";
import { User } from "../types";
import { getUserProfile } from "../utils/userProfile";

interface UseBoardListCursorProps {
  projectId: string | undefined;
  user: User;
  sessionId: string;
  cursorColor: string;
}

export function useBoardListCursor({
  projectId,
  user,
  sessionId,
  cursorColor,
}: UseBoardListCursorProps) {
  const throttleTimerRef = useRef<number | null>(null);
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

  useEffect(() => {
    if (!projectId) {
      return;
    }

    const handleMouseMove = (e: MouseEvent) => {
      if (throttleTimerRef.current) return;

      throttleTimerRef.current = window.setTimeout(() => {
        // Calculate coordinates considering scroll position
        const boardListElement = document.querySelector(".board-list");
        if (!boardListElement) {
          throttleTimerRef.current = null;
          return;
        }

        const rect = boardListElement.getBoundingClientRect();
        const scrollTop = boardListElement.scrollTop || 0;
        const scrollLeft = boardListElement.scrollLeft || 0;

        // Calculate relative coordinates within the board list
        const relativeX = e.clientX - rect.left + scrollLeft;
        const relativeY = e.clientY - rect.top + scrollTop;

        const cursorRef = ref(
          rtdb,
          `boardListCursors/${projectId}/${user.uid}-${sessionId}`
        );
        const userName = user.displayName || user.email || "User";
        const initials = userName
          .split(" ")
          .map((word) => word.charAt(0).toUpperCase())
          .slice(0, 2)
          .join("");

        const cursorData = {
          x: relativeX,
          y: relativeY,
          name: initials,
          fullName: `${userName} (${sessionId})`,
          color: cursorColor,
          timestamp: Date.now(),
          photoURL: user.photoURL,
          username: username,
        };

        set(cursorRef, cursorData).catch((error) => {
          console.error("Error updating board list cursor:", error);
        });

        throttleTimerRef.current = null;
      }, 50); // Throttle to 20fps
    };

    document.addEventListener("mousemove", handleMouseMove);

    // Cleanup cursor on unmount or page close
    const cleanup = () => {
      const cursorRef = ref(
        rtdb,
        `boardListCursors/${projectId}/${user.uid}-${sessionId}`
      );
      remove(cursorRef).catch((error) => {
        console.error("Error removing board list cursor:", error);
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
  }, [
    projectId,
    user.uid,
    sessionId,
    cursorColor,
    user.displayName,
    user.email,
  ]);
}
