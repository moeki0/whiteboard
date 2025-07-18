import { AlgoliaBoard } from "../config/algolia";
import { rtdb, functions, auth } from "../config/firebase";
import { ref, get } from "firebase/database";
import { httpsCallable } from "firebase/functions";
import { Board, Project } from "../types";

// Convert Firebase board data to Algolia format
export async function boardToAlgoliaObject(
  boardId: string,
  board: Board
): Promise<AlgoliaBoard | null> {
  try {
    // Get project information
    const projectRef = ref(rtdb, `projects/${board.projectId}`);
    const projectSnapshot = await get(projectRef);

    if (!projectSnapshot.exists()) {
      console.warn(`Project ${board.projectId} not found for board ${boardId}`);
      return null;
    }

    const project: Project = projectSnapshot.val();

    // Get all notes content from the board
    const notesRef = ref(rtdb, `boards/${boardId}/notes`);
    const notesSnapshot = await get(notesRef);
    let notesText = "";

    if (notesSnapshot.exists()) {
      const notes = notesSnapshot.val();
      const notesContent = Object.values(notes)
        .filter(
          (note: unknown): note is { content: string } =>
            typeof note === "object" &&
            note !== null &&
            "content" in note &&
            typeof (note as { content: unknown }).content === "string"
        )
        .map((note) => note.content.trim())
        .filter((content) => content.length > 0);

      notesText = notesContent.join(" ");
    }

    // Extract searchable content
    const boardData = board as Board & {
      metadata?: {
        title?: string;
        description?: string;
        thumbnailUrl?: string;
      };
    };
    const title = boardData.metadata?.title || board.name || "";
    const description = boardData.metadata?.description || "";
    const searchableText = [title, description, board.name, notesText]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    return {
      objectID: boardId,
      boardId,
      name: board.name || "",
      title,
      description,
      projectId: board.projectId,
      projectName: project.name || "",
      projectSlug: project.slug,
      createdAt: board.createdAt || 0,
      updatedAt: board.updatedAt || board.createdAt || 0,
      thumbnailUrl: boardData.metadata?.thumbnailUrl,
      searchableText,
    };
  } catch (error) {
    console.error("Error converting board to Algolia object:", error);
    return null;
  }
}

// Add or update a board in Algolia index via Firebase Functions
export async function syncBoardToAlgolia(
  boardId: string,
  board: Board
): Promise<void> {
  try {
    // 認証状態を確認
    if (!auth.currentUser) {
      console.warn("User not authenticated, skipping Algolia sync");
      return;
    }

    const algoliaBoard = await boardToAlgoliaObject(boardId, board);
    if (algoliaBoard) {
      const syncBoard = httpsCallable(functions, "syncBoard");
      const result = await syncBoard({ board: algoliaBoard });
      console.log("Board synced to Algolia:", result.data);
    }
  } catch (error) {
    console.error(`Error syncing board ${boardId} to Algolia:`, error);

    // 開発環境ではエラーを無視
    if (import.meta.env.DEV) {
      console.warn("Algolia sync disabled in development mode");
      return;
    }
    // 本番環境でもFirebase Functionsのエラーは無視（ログのみ出力）
    console.warn("Algolia sync failed, continuing without sync:", error);
    return;
  }
}

// Remove a board from Algolia index via Firebase Functions
export async function removeBoardFromAlgolia(boardId: string): Promise<void> {
  try {
    // 認証状態を確認
    if (!auth.currentUser) {
      console.warn("User not authenticated, skipping Algolia remove");
      return;
    }

    const removeBoard = httpsCallable(functions, "removeBoard");
    const result = await removeBoard({ objectID: boardId });
    console.log("Board removed from Algolia:", result.data);
  } catch (error) {
    console.error(`Error removing board ${boardId} from Algolia:`, error);

    // 開発環境ではエラーを無視
    if (import.meta.env.DEV) {
      console.warn("Algolia remove disabled in development mode");
      return;
    }
    // 本番環境でもFirebase Functionsのエラーは無視（ログのみ出力）
    console.warn("Algolia remove failed, continuing without sync:", error);
    return;
  }
}

// Bulk sync all boards in a project to Algolia via Firebase Functions
export async function syncProjectBoardsToAlgolia(
  projectId: string
): Promise<void> {
  try {
    // Get all boards in the project
    const projectBoardsRef = ref(rtdb, `projectBoards/${projectId}`);
    const projectBoardsSnapshot = await get(projectBoardsRef);

    if (!projectBoardsSnapshot.exists()) {
      return;
    }

    const projectBoardsData = projectBoardsSnapshot.val();
    const boardIds = Object.keys(projectBoardsData);
    const algoliaObjects: AlgoliaBoard[] = [];

    // Convert each board to Algolia format
    for (const boardId of boardIds) {
      const boardRef = ref(rtdb, `boards/${boardId}`);
      const boardSnapshot = await get(boardRef);

      if (boardSnapshot.exists()) {
        const board: Board = { id: boardId, ...boardSnapshot.val() };
        const algoliaBoard = await boardToAlgoliaObject(boardId, board);
        if (algoliaBoard) {
          algoliaObjects.push(algoliaBoard);
        }
      }
    }

    // Bulk save to Algolia via Firebase Functions
    if (algoliaObjects.length > 0) {
      const syncProject = httpsCallable(functions, "syncProject");
      await syncProject({ boards: algoliaObjects });
    }
  } catch (error) {
    console.error(
      `Error syncing project ${projectId} boards to Algolia:`,
      error
    );

    // 開発環境ではエラーを無視
    if (process.env.NODE_ENV === "development") {
      console.warn("Algolia project sync disabled in development mode");
      return;
    }
    throw error;
  }
}

// Initialize Algolia index with all existing boards
export async function initializeAlgoliaIndex(): Promise<void> {
  try {
    // Get all projects (we'll sync through projects to get project info)
    const projectsRef = ref(rtdb, "projects");
    const projectsSnapshot = await get(projectsRef);

    if (!projectsSnapshot.exists()) {
      return;
    }

    const projects = projectsSnapshot.val();
    const projectIds = Object.keys(projects);

    // Sync all project boards via Firebase Functions
    for (const projectId of projectIds) {
      await syncProjectBoardsToAlgolia(projectId);
    }
  } catch (error) {
    console.error("Error initializing Algolia index:", error);
  }
}
