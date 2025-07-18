import { boardsAdminIndex, AlgoliaBoard } from '../config/algolia';
import { rtdb } from '../config/firebase';
import { ref, get } from 'firebase/database';
import { Board, Project } from '../types';

// Convert Firebase board data to Algolia format
export async function boardToAlgoliaObject(boardId: string, board: Board): Promise<AlgoliaBoard | null> {
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
    let notesText = '';
    
    if (notesSnapshot.exists()) {
      const notes = notesSnapshot.val();
      const notesContent = Object.values(notes)
        .filter((note: any) => note && note.content)
        .map((note: any) => note.content.trim())
        .filter(content => content.length > 0);
      
      notesText = notesContent.join(' ');
    }
    
    // Extract searchable content
    const title = board.metadata?.title || board.name || '';
    const description = board.metadata?.description || '';
    const searchableText = [title, description, board.name, notesText].filter(Boolean).join(' ').toLowerCase();
    
    return {
      objectID: boardId,
      boardId,
      name: board.name || '',
      title,
      description,
      projectId: board.projectId,
      projectName: project.name || '',
      projectSlug: project.slug,
      createdAt: board.createdAt || 0,
      updatedAt: board.updatedAt || board.createdAt || 0,
      thumbnailUrl: board.metadata?.thumbnailUrl,
      searchableText
    };
  } catch (error) {
    console.error('Error converting board to Algolia object:', error);
    return null;
  }
}

// Add or update a board in Algolia index
export async function syncBoardToAlgolia(boardId: string, board: Board): Promise<void> {
  try {
    const algoliaBoard = await boardToAlgoliaObject(boardId, board);
    if (algoliaBoard) {
      await boardsAdminIndex.saveObject(algoliaBoard);
      console.log(`Board ${boardId} synced to Algolia`);
    }
  } catch (error) {
    console.error(`Error syncing board ${boardId} to Algolia:`, error);
  }
}

// Remove a board from Algolia index
export async function removeBoardFromAlgolia(boardId: string): Promise<void> {
  try {
    await boardsAdminIndex.deleteObject(boardId);
    console.log(`Board ${boardId} removed from Algolia`);
  } catch (error) {
    console.error(`Error removing board ${boardId} from Algolia:`, error);
  }
}

// Bulk sync all boards in a project to Algolia
export async function syncProjectBoardsToAlgolia(projectId: string): Promise<void> {
  try {
    console.log(`Starting sync for project ${projectId}...`);
    
    // Get all boards in the project
    const projectBoardsRef = ref(rtdb, `projectBoards/${projectId}`);
    const projectBoardsSnapshot = await get(projectBoardsRef);
    
    if (!projectBoardsSnapshot.exists()) {
      console.log(`No boards found for project ${projectId}`);
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
    
    // Bulk save to Algolia
    if (algoliaObjects.length > 0) {
      await boardsAdminIndex.saveObjects(algoliaObjects);
      console.log(`Synced ${algoliaObjects.length} boards from project ${projectId} to Algolia`);
    }
  } catch (error) {
    console.error(`Error syncing project ${projectId} boards to Algolia:`, error);
  }
}

// Initialize Algolia index with all existing boards
export async function initializeAlgoliaIndex(): Promise<void> {
  try {
    console.log('Initializing Algolia index...');
    
    // Clear existing index
    await boardsAdminIndex.clearObjects();
    
    // Configure index settings
    await boardsAdminIndex.setSettings({
      attributesForFaceting: ['projectId', 'projectName'],
      searchableAttributes: ['title', 'description', 'name', 'searchableText'],
      attributesToRetrieve: [
        'objectID',
        'boardId', 
        'name',
        'title',
        'description',
        'projectId',
        'projectName',
        'projectSlug',
        'createdAt',
        'updatedAt',
        'thumbnailUrl'
      ],
      attributesToHighlight: ['title', 'description', 'name'],
      hitsPerPage: 20
    });
    
    console.log('✅ Index settings configured');
    
    // Get all projects (we'll sync through projects to get project info)
    const projectsRef = ref(rtdb, 'projects');
    const projectsSnapshot = await get(projectsRef);
    
    if (!projectsSnapshot.exists()) {
      console.log('No projects found');
      return;
    }
    
    const projects = projectsSnapshot.val();
    const projectIds = Object.keys(projects);
    
    // Sync all project boards
    for (const projectId of projectIds) {
      await syncProjectBoardsToAlgolia(projectId);
    }
    
    console.log('Algolia index initialization complete');
  } catch (error) {
    console.error('Error initializing Algolia index:', error);
  }
}