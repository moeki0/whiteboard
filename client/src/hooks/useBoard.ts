import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { rtdb } from "../config/firebase";
import { ref, onValue, set, remove, get } from "firebase/database";
import { User, Note, Cursor, Board, Project, Arrow } from "../types";
import { useProject } from "../contexts/ProjectContext";
import { useSlug } from "../contexts/SlugContext";
import { checkBoardAccess } from "../utils/permissions";
import { recordBoardNameChange } from "../utils/historyManager";
import { generateNewBoardName } from "../utils/boardNaming";
import { createBoardFromTitle } from "../utils/boardCreator";

interface UseBoardReturn {
  boardId: string | undefined;
  notes: Note[];
  arrows: Arrow[];
  cursors: Record<string, Cursor>;
  boardName: string;
  projectId: string | null;
  isCheckingAccess: boolean;
  isEditingTitle: boolean;
  editingBoardName: string;
  setIsEditingTitle: (editing: boolean) => void;
  setEditingBoardName: (name: string) => void;
  saveBoardName: () => Promise<void>;
  board: Board | null;
  project: Project | null;
}

export function useBoard(
  user: User | null,
  navigate: (path: string) => void,
  sessionId: string
): UseBoardReturn {
  const { boardId: urlBoardId } = useParams<{ boardId: string }>();
  const { resolvedBoardId } = useSlug();
  const boardId = resolvedBoardId || urlBoardId;
  const { updateCurrentProject, currentProjectId } = useProject();
  const [notes, setNotes] = useState<Note[]>([]);
  const [arrows, setArrows] = useState<Arrow[]>([]);
  const [cursors, setCursors] = useState<Record<string, Cursor>>({});
  const [boardName, setBoardName] = useState<string>("");
  const [projectId, setProjectId] = useState<string | null>(null);
  const [isCheckingAccess, setIsCheckingAccess] = useState<boolean>(true);
  const [isEditingTitle, setIsEditingTitle] = useState<boolean>(false);
  const [editingBoardName, setEditingBoardName] = useState<string>("");
  const [board, setBoard] = useState<Board | null>(null);
  const [project, setProject] = useState<Project | null>(null);

  // Check access permissions function
  const checkAccess = async (boardData: Record<string, unknown>) => {
    const currentBoard: Board = {
      id: boardId || "",
      name: (boardData.name as string) || "",
      createdBy: (boardData.createdBy as string) || "",
      createdAt: (boardData.createdAt as number) || Date.now(),
      projectId: (boardData.projectId as string) || "",
      ...boardData,
    };

    let currentProject: Project | null = null;
    if (boardData.projectId) {
      const projectRef = ref(rtdb, `projects/${boardData.projectId}`);
      const projectSnapshot = await get(projectRef);
      if (projectSnapshot.exists()) {
        currentProject = { id: boardData.projectId, ...projectSnapshot.val() };
      }
    }

    // State を更新
    setBoard(currentBoard);
    setProject(currentProject);

    const accessResult = checkBoardAccess(
      currentBoard,
      currentProject,
      user?.uid || null
    );
    if (!accessResult.hasAccess) {
      alert(
        `Access denied: ${
          accessResult.reason ||
          "You do not have permission to access this board."
        }`
      );
      navigate("/");
      return false;
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
        const oldName = boardName;
        const newName = editingBoardName.trim();
        
        const boardRef = ref(rtdb, `boards/${boardId}/name`);
        await set(boardRef, newName);
        setBoardName(newName);
        
        // Record the name change in history
        if (boardId) {
          await recordBoardNameChange(boardId, oldName, newName);
        }
      } catch (error) {
        console.error("Error updating board name:", error);
        setEditingBoardName(boardName);
      }
    }
    setIsEditingTitle(false);
  };

  // Handle deleted board by creating a new one
  const handleDeletedBoard = async () => {
    if (!user?.uid) {
      alert("This board has been deleted.");
      navigate("/");
      return;
    }

    try {
      // Try to get project context from current project state
      let targetProjectId = currentProjectId;

      // If no current project, try to find a project where user is a member
      if (!targetProjectId) {
        const projectsRef = ref(rtdb, 'projects');
        const projectsSnapshot = await get(projectsRef);
        if (projectsSnapshot.exists()) {
          const projects = projectsSnapshot.val();
          // Find first project where user is a member
          for (const [pid, project] of Object.entries(projects)) {
            const projectData = project as Project;
            if (projectData.members && projectData.members[user.uid]) {
              targetProjectId = pid;
              break;
            }
          }
        }
      }

      if (!targetProjectId) {
        alert("This board has been deleted and no accessible project found.");
        navigate("/");
        return;
      }

      // Generate a new unique board name
      const newBoardName = await generateNewBoardName(targetProjectId);
      
      // Create a new board
      const newBoardId = await createBoardFromTitle(
        targetProjectId,
        newBoardName,
        user.uid
      );

      console.log(`Created new board "${newBoardName}" (${newBoardId}) to replace deleted board`);
      
      // Navigate to the new board
      navigate(`/board/${newBoardId}`);
      
    } catch (error) {
      console.error("Error creating replacement board:", error);
      alert("This board has been deleted and could not create a replacement.");
      navigate("/");
    }
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

        // Update current project in context
        if (boardData.projectId) {
          // Get project name and update context
          const projectRef = ref(rtdb, `projects/${boardData.projectId}`);
          const projectSnapshot = await get(projectRef);
          if (projectSnapshot.exists()) {
            const projectName = projectSnapshot.val().name;
            updateCurrentProject(boardData.projectId, projectName);
          } else {
            updateCurrentProject(boardData.projectId);
          }
        }

        // Check initial access permissions
        const hasAccess = await checkAccess(boardData);
        if (!hasAccess) return;

        // Access check complete, allow rendering
        setIsCheckingAccess(false);
      } else {
        // Board doesn't exist, stop checking access
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

        // Update current project in context
        if (boardData.projectId) {
          // Get project name and update context
          const projectRef = ref(rtdb, `projects/${boardData.projectId}`);
          const projectSnapshot = await get(projectRef);
          if (projectSnapshot.exists()) {
            const projectName = projectSnapshot.val().name;
            updateCurrentProject(boardData.projectId, projectName);
          } else {
            updateCurrentProject(boardData.projectId);
          }
        }

        // Check access permissions in real-time
        if (!isCheckingAccess) {
          await checkAccess(boardData);
        }
      } else {
        // Board doesn't exist - this is normal for non-existent board IDs
        // Let the component handle this case appropriately
        console.log(`Board ${boardId} does not exist`);
      }
    });

    const notesRef = ref(rtdb, `boards/${boardId}/notes`);
    const arrowsRef = ref(rtdb, `boards/${boardId}/arrows`);
    const cursorsRef = ref(rtdb, `boardCursors/${boardId}`);

    // Listen to notes changes
    const unsubscribeNotes = onValue(notesRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const notesArray = Object.entries(data).map(([id, note]) => ({
          id,
          type: 'note' as const,
          ...(note as Record<string, unknown>),
        })) as Note[];
        setNotes(notesArray);
      } else {
        setNotes([]);
      }
    });

    // Listen to arrows changes
    const unsubscribeArrows = onValue(arrowsRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const arrowsArray = Object.entries(data).map(([id, arrow]) => ({
          id,
          type: 'arrow' as const,
          ...(arrow as Record<string, unknown>),
        })) as Arrow[];
        setArrows(arrowsArray);
      } else {
        setArrows([]);
      }
    });

    // Listen to cursor changes
    const unsubscribeCursors = onValue(cursorsRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const cursorsObj: Record<string, Cursor> = {};
        const now = Date.now();
        const CURSOR_TIMEOUT = 30000; // 30 seconds timeout

        Object.entries(data).forEach(([cursorId, cursor]: [string, unknown]) => {
          const cursorData = cursor as Cursor;
          // Remove old cursors
          if (now - cursorData.timestamp > CURSOR_TIMEOUT) {
            const oldCursorRef = ref(
              rtdb,
              `boardCursors/${boardId}/${cursorId}`
            );
            remove(oldCursorRef).catch(console.error);
            return;
          }

          if (cursorId !== `${user?.uid || "anonymous"}-${sessionId}`) {
            // Don't show own session cursor
            cursorsObj[cursorId] = cursorData;
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
      unsubscribeArrows();
      unsubscribeCursors();
    };
  }, [boardId, user?.uid, sessionId, isCheckingAccess, navigate]);

  return {
    boardId,
    notes,
    arrows,
    cursors,
    boardName,
    projectId,
    isCheckingAccess,
    isEditingTitle,
    editingBoardName,
    setIsEditingTitle,
    setEditingBoardName,
    saveBoardName,
    board,
    project,
  };
}
