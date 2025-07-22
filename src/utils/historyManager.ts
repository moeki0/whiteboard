import { rtdb } from '../config/firebase';
import { ref, push, get } from 'firebase/database';
import { SlugHistory, NameHistory } from '../types';

/**
 * Records a project slug change in the history
 */
export async function recordProjectSlugChange(
  projectId: string,
  oldSlug: string,
  newSlug: string
): Promise<void> {
  try {
    const historyRef = ref(rtdb, `projectSlugHistory/${projectId}`);
    const historyEntry: SlugHistory = {
      oldSlug,
      newSlug,
      timestamp: Date.now(),
    };
    await push(historyRef, historyEntry);
  } catch (error) {
    console.error('Error recording project slug change:', error);
  }
}

/**
 * Records a board name change in the history
 */
export async function recordBoardNameChange(
  boardId: string,
  oldName: string,
  newName: string
): Promise<void> {
  try {
    const historyRef = ref(rtdb, `boardNameHistory/${boardId}`);
    const historyEntry: NameHistory = {
      oldName,
      newName,
      timestamp: Date.now(),
    };
    await push(historyRef, historyEntry);
  } catch (error) {
    console.error('Error recording board name change:', error);
  }
}

/**
 * Finds the current project ID from a historical slug
 */
export async function findProjectIdByHistoricalSlug(slug: string): Promise<string | null> {
  try {
    // First, check if the slug is currently in use
    const projectsRef = ref(rtdb, 'projects');
    const projectsSnapshot = await get(projectsRef);
    
    if (projectsSnapshot.exists()) {
      const projects = projectsSnapshot.val();
      for (const [projectId, projectData] of Object.entries(projects)) {
        if ((projectData as { slug?: string }).slug === slug) {
          return projectId;
        }
      }
    }

    // If not found, search in history
    const historyRef = ref(rtdb, 'projectSlugHistory');
    const historySnapshot = await get(historyRef);
    
    if (historySnapshot.exists()) {
      const allHistory = historySnapshot.val();
      for (const [projectId, projectHistory] of Object.entries(allHistory)) {
        const historyEntries = Object.values(projectHistory as Record<string, SlugHistory>);
        for (const entry of historyEntries) {
          if (entry.oldSlug === slug) {
            return projectId;
          }
        }
      }
    }

    return null;
  } catch (error) {
    console.error('Error finding project ID by historical slug:', error);
    return null;
  }
}

/**
 * Finds the current board ID from a historical name
 */
export async function findBoardIdByHistoricalName(
  projectId: string,
  name: string
): Promise<string | null> {
  try {
    // First, check if the name is currently in use (optimized version)
    const projectBoardsRef = ref(rtdb, `projectBoards/${projectId}`);
    const projectBoardsSnapshot = await get(projectBoardsRef);
    
    if (projectBoardsSnapshot.exists()) {
      const projectBoardsData = projectBoardsSnapshot.val();
      
      // Check names directly from projectBoards data (faster than individual queries)
      for (const [boardId, boardData] of Object.entries(projectBoardsData)) {
        if ((boardData as { name?: string }).name === name) {
          return boardId;
        }
      }
    }

    // If not found, search in history (early exit if no history exists)
    const historyRef = ref(rtdb, 'boardNameHistory');
    const historySnapshot = await get(historyRef);
    
    if (!historySnapshot.exists()) {
      return null; // No history at all, early exit
    }
    
    const allHistory = historySnapshot.val();
    
    // Pre-filter boards that belong to this project to avoid individual board queries
    const projectBoardsForHistory = projectBoardsSnapshot.exists() ? 
      Object.keys(projectBoardsSnapshot.val()) : [];
    
    for (const [boardId, boardHistory] of Object.entries(allHistory)) {
      // Only check boards that belong to this project
      if (projectBoardsForHistory.includes(boardId)) {
        const historyEntries = Object.values(boardHistory as Record<string, NameHistory>);
        for (const entry of historyEntries) {
          if (entry.oldName === name) {
            return boardId;
          }
        }
      }
    }

    return null;
  } catch (error) {
    console.error('Error finding board ID by historical name:', error);
    return null;
  }
}

/**
 * Gets the latest slug for a project
 */
export async function getLatestProjectSlug(projectId: string): Promise<string | null> {
  try {
    const projectRef = ref(rtdb, `projects/${projectId}`);
    const projectSnapshot = await get(projectRef);
    
    if (projectSnapshot.exists()) {
      const projectData = projectSnapshot.val();
      return projectData.slug || null;
    }
    
    return null;
  } catch (error) {
    console.error('Error getting latest project slug:', error);
    return null;
  }
}

/**
 * Gets the latest name for a board
 */
export async function getLatestBoardName(boardId: string): Promise<string | null> {
  try {
    const boardRef = ref(rtdb, `boards/${boardId}`);
    const boardSnapshot = await get(boardRef);
    
    if (boardSnapshot.exists()) {
      const boardData = boardSnapshot.val();
      return boardData.name || null;
    }
    
    return null;
  } catch (error) {
    console.error('Error getting latest board name:', error);
    return null;
  }
}