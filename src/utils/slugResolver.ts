import { rtdb } from '../config/firebase';
import { ref, get, query, orderByChild, equalTo } from 'firebase/database';

/**
 * Resolves a project slug to its ID by searching all projects
 */
export async function resolveProjectSlug(projectSlug: string): Promise<string | null> {
  try {
    const projectsRef = ref(rtdb, 'projects');
    const projectQuery = query(projectsRef, orderByChild('slug'), equalTo(projectSlug));
    const snapshot = await get(projectQuery);
    
    if (snapshot.exists()) {
      const projects = snapshot.val();
      const projectId = Object.keys(projects)[0];
      return projectId;
    }
    
    return null;
  } catch (error) {
    console.error('Error resolving project slug:', error);
    return null;
  }
}

/**
 * Resolves a board name to its ID within a specific project
 */
export async function resolveBoardName(projectId: string, boardName: string): Promise<string | null> {
  try {
    // First, get all boards for the project
    const projectBoardsRef = ref(rtdb, `projectBoards/${projectId}`);
    const projectBoardsSnapshot = await get(projectBoardsRef);
    
    if (!projectBoardsSnapshot.exists()) {
      return null;
    }
    
    const projectBoardsData = projectBoardsSnapshot.val();
    const boardIds = Object.keys(projectBoardsData);
    
    // Check each board to find the one with matching name
    for (const boardId of boardIds) {
      const boardRef = ref(rtdb, `boards/${boardId}`);
      const boardSnapshot = await get(boardRef);
      
      if (boardSnapshot.exists()) {
        const boardData = boardSnapshot.val();
        if (boardData.name === boardName) {
          return boardId;
        }
      }
    }
    
    return null;
  } catch (error) {
    console.error('Error resolving board name:', error);
    return null;
  }
}

/**
 * Resolves both project slug and board name to their respective IDs
 */
export async function resolveProjectAndBoardSlugs(
  projectSlug: string,
  boardName: string
): Promise<{ projectId: string | null; boardId: string | null }> {
  try {
    const projectId = await resolveProjectSlug(projectSlug);
    if (!projectId) {
      return { projectId: null, boardId: null };
    }
    
    const boardId = await resolveBoardName(projectId, boardName);
    return { projectId, boardId };
  } catch (error) {
    console.error('Error resolving project slug and board name:', error);
    return { projectId: null, boardId: null };
  }
}