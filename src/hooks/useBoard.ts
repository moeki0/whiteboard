import { useState, useEffect, useCallback } from "react";
import { useParams } from "react-router-dom";
import { rtdb } from "../config/firebase";
import { ref, onValue, set, remove, get } from "firebase/database";
import { User, Note, Cursor } from "../types";

interface UseBoardReturn {
  boardId: string | undefined;
  notes: Note[];
  cursors: Record<string, Cursor>;
  boardName: string;
  projectId: string | null;
  isCheckingAccess: boolean;
  isEditingTitle: boolean;
  editingBoardName: string;
  setIsEditingTitle: (editing: boolean) => void;
  setEditingBoardName: (name: string) => void;
  saveBoardName: () => Promise<void>;
}

export function useBoard(user: User, navigate: any, sessionId: string): UseBoardReturn {
  const { boardId } = useParams<{ boardId: string }>();
  const [notes, setNotes] = useState<Note[]>([]);
  const [cursors, setCursors] = useState<Record<string, Cursor>>({});
  const [boardName, setBoardName] = useState<string>("");
  const [projectId, setProjectId] = useState<string | null>(null);
  const [isCheckingAccess, setIsCheckingAccess] = useState<boolean>(true);
  const [isEditingTitle, setIsEditingTitle] = useState<boolean>(false);
  const [editingBoardName, setEditingBoardName] = useState<string>("");

  // Check access permissions function
  const checkAccess = async (boardData: any) => {
    if (!boardData.isPublic && boardData.projectId) {
      const projectRef = ref(rtdb, `projects/${boardData.projectId}`);
      const projectSnapshot = await get(projectRef);

      if (projectSnapshot.exists()) {
        const projectData = projectSnapshot.val();
        const isMember = projectData.members?.[user.uid];

        if (!isMember) {
          alert("This board is private. Only project members can access it.");
          navigate("/");
          return false;
        }
      }
    }
    return true;
  };

  const saveBoardName = async () => {
    if (!editingBoardName.trim()) {
      setEditingBoardName(boardName);
      setIsEditingTitle(false);
      return;
    }

    if (editingBoardName.trim() !== boardName) {
      try {
        const boardRef = ref(rtdb, `boards/${boardId}/name`);
        await set(boardRef, editingBoardName.trim());
        setBoardName(editingBoardName.trim());
      } catch (error) {
        console.error("Error updating board name:", error);
        setEditingBoardName(boardName);
      }
    }
    setIsEditingTitle(false);
  };

  useEffect(() => {
    if (!boardId) return;

    // Get board info and project ID
    const getBoardInfo = async () => {
      const boardRef = ref(rtdb, `boards/${boardId}`);
      const boardSnapshot = await get(boardRef);
      if (boardSnapshot.exists()) {
        const boardData = boardSnapshot.val();
        setBoardName(boardData.name);
        setEditingBoardName(boardData.name);
        setProjectId(boardData.projectId);

        // Check initial access permissions
        const hasAccess = await checkAccess(boardData);
        if (!hasAccess) return;
        
        // Access check complete, allow rendering
        setIsCheckingAccess(false);
      }
    };

    getBoardInfo();

    // Listen to board changes for real-time access control
    const boardRef = ref(rtdb, `boards/${boardId}`);
    const unsubscribeBoard = onValue(boardRef, async (snapshot) => {
      if (snapshot.exists()) {
        const boardData = snapshot.val();
        setBoardName(boardData.name);
        setEditingBoardName(boardData.name);
        setProjectId(boardData.projectId);

        // Check access permissions in real-time
        if (!isCheckingAccess) {
          await checkAccess(boardData);
        }
      } else {
        // Board was deleted
        alert("This board has been deleted.");
        navigate("/");
      }
    });

    const notesRef = ref(rtdb, `boardNotes/${boardId}`);
    const cursorsRef = ref(rtdb, `boardCursors/${boardId}`);

    // Listen to notes changes
    const unsubscribeNotes = onValue(notesRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const notesArray = Object.entries(data).map(([id, note]) => ({
          id,
          ...note,
        })) as Note[];
        setNotes(notesArray);
      } else {
        setNotes([]);
      }
    });

    // Listen to cursor changes
    const unsubscribeCursors = onValue(cursorsRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const cursorsObj: Record<string, Cursor> = {};
        const now = Date.now();
        const CURSOR_TIMEOUT = 30000; // 30 seconds timeout

        Object.entries(data).forEach(([cursorId, cursor]: [string, any]) => {
          // Remove old cursors
          if (now - cursor.timestamp > CURSOR_TIMEOUT) {
            const oldCursorRef = ref(rtdb, `boardCursors/${boardId}/${cursorId}`);
            remove(oldCursorRef).catch(console.error);
            return;
          }

          if (cursorId !== `${user.uid}-${sessionId}`) {
            // Don't show own session cursor
            cursorsObj[cursorId] = cursor;
          }
        });
        setCursors(cursorsObj);
      } else {
        setCursors({});
      }
    });

    return () => {
      unsubscribeBoard();
      unsubscribeNotes();
      unsubscribeCursors();
    };
  }, [boardId, user.uid, sessionId, isCheckingAccess, navigate]);

  return {
    boardId,
    notes,
    cursors,
    boardName,
    projectId,
    isCheckingAccess,
    isEditingTitle,
    editingBoardName,
    setIsEditingTitle,
    setEditingBoardName,
    saveBoardName,
  };
}