import { ref, get, update } from "firebase/database";
import { rtdb } from "../config/firebase";
import { Board } from "../types";
import { boardListCache } from "./boardListCache";
import { getProjectBoardsList, BoardListItem, migrateToNewStructure } from "./boardDataStructure";
import { 
  shouldUseNewStructure, 
  shouldAutoMigrate, 
  updateMigrationStatus,
  getMigrationConfig 
} from "./migrationManager";

// Denormalized board data structure for faster queries
export interface DenormalizedBoard extends Board {
  // Include all necessary fields for list display
  title?: string;
  description?: string;
  thumbnailUrl?: string;
}

/**
 * Get paginated boards with denormalized data
 * This reduces the number of database queries from N+1 to 1
 */
export async function getPaginatedBoards(
  projectId: string,
  page: number,
  itemsPerPage: number
): Promise<{
  boards: DenormalizedBoard[];
  totalCount: number;
  allBoardIds: string[];
  usedNewStructure: boolean;
}> {
  const startTime = performance.now();
  
  try {
    // Check cache first
    const cacheKey = boardListCache.getBoardListKey(projectId, page);
    const cachedData = boardListCache.get(cacheKey);
    if (cachedData) {
      console.log(`📋 Cache hit for ${projectId} page ${page}`);
      return { 
        ...(cachedData as { boards: any[], totalCount: number, allBoardIds: string[] }), 
        usedNewStructure: (cachedData as any)?.usedNewStructure ?? false 
      };
    }
    
    // 移行管理に基づいて使用する構造を決定
    const useNewStructure = await shouldUseNewStructure(projectId);
    console.log(`📋 Project ${projectId}: Using ${useNewStructure ? 'NEW' : 'OLD'} structure`);
    
    // 新構造を使用する場合
    if (useNewStructure) {
      try {
        const newStructureResult = await getProjectBoardsList(projectId, page, itemsPerPage);
        
        if (newStructureResult.boards.length > 0 || newStructureResult.totalCount === 0) {
          // Convert BoardListItem to DenormalizedBoard
          const denormalizedBoards: DenormalizedBoard[] = newStructureResult.boards.map(item => ({
            id: item.id,
            name: item.name,
            title: item.title,
            description: item.description,
            thumbnailUrl: item.thumbnailUrl,
            createdBy: item.createdBy,
            createdAt: item.createdAt,
            updatedAt: item.updatedAt,
            isPinned: item.isPinned,
            projectId: item.projectId,
            metadata: {
              title: item.title,
              description: item.description,
              thumbnailUrl: item.thumbnailUrl
            }
          }));
          
          const result = {
            boards: denormalizedBoards,
            totalCount: newStructureResult.totalCount,
            allBoardIds: newStructureResult.allBoardIds,
            usedNewStructure: true
          };
          
          // Cache the result
          boardListCache.set(cacheKey, result);
          
          const endTime = performance.now();
          console.log(`📋 NEW structure query completed in ${(endTime - startTime).toFixed(2)}ms`);
          
          return result;
        } else {
          console.log('📋 New structure exists but no data, falling back to old structure');
        }
      } catch (error) {
        console.warn('📋 New structure failed, falling back to old structure:', error);
        // 新構造でエラーが発生した場合、ステータスを更新
        await updateMigrationStatus(projectId, 'error', error instanceof Error ? error.message : String(error));
      }
    }
    
    // 自動移行の判定と実行
    const shouldMigrate = await shouldAutoMigrate(projectId);
    if (shouldMigrate) {
      console.log(`📋 Auto-migrating project ${projectId}`);
      try {
        await updateMigrationStatus(projectId, 'migrating');
        await migrateToNewStructure(projectId);
        await updateMigrationStatus(projectId, 'migrated');
        
        // 移行完了後、新構造でリトライ
        const newStructureResult = await getProjectBoardsList(projectId, page, itemsPerPage);
        
        const denormalizedBoards: DenormalizedBoard[] = newStructureResult.boards.map(item => ({
          id: item.id,
          name: item.name,
          title: item.title,
          description: item.description,
          thumbnailUrl: item.thumbnailUrl,
          createdBy: item.createdBy,
          createdAt: item.createdAt,
          updatedAt: item.updatedAt,
          isPinned: item.isPinned,
          projectId: item.projectId,
          metadata: {
            title: item.title,
            description: item.description,
            thumbnailUrl: item.thumbnailUrl
          }
        }));
        
        const result = {
          boards: denormalizedBoards,
          totalCount: newStructureResult.totalCount,
          allBoardIds: newStructureResult.allBoardIds,
          usedNewStructure: true
        };
        
        boardListCache.set(cacheKey, result);
        
        const endTime = performance.now();
        console.log(`📋 Auto-migration and NEW structure query completed in ${(endTime - startTime).toFixed(2)}ms`);
        
        return result;
      } catch (error) {
        console.error('📋 Auto-migration failed:', error);
        await updateMigrationStatus(projectId, 'error', error instanceof Error ? error.message : String(error));
        // フォールバック処理を継続
      }
    }
    // First, check if we have denormalized data
    const denormalizedRef = ref(rtdb, `projectBoardsDenormalized/${projectId}`);
    const denormalizedSnapshot = await get(denormalizedRef);
    
    if (denormalizedSnapshot.exists()) {
      // Use denormalized data (single query)
      const allBoards = denormalizedSnapshot.val() as Record<string, DenormalizedBoard>;
      
      // Convert to array and sort
      const boardsArray = Object.entries(allBoards).map(([id, board]) => ({
        ...board,
        id
      }));
      
      // Sort boards: pinned first, then by timestamp
      boardsArray.sort((a, b) => {
        if (a.isPinned && !b.isPinned) return -1;
        if (!a.isPinned && b.isPinned) return 1;
        return (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0);
      });
      
      const allBoardIds = boardsArray.map(b => b.id);
      const startIndex = (page - 1) * itemsPerPage;
      const endIndex = startIndex + itemsPerPage;
      const paginatedBoards = boardsArray.slice(startIndex, endIndex);
      
      const result = {
        boards: paginatedBoards,
        totalCount: boardsArray.length,
        allBoardIds,
        usedNewStructure: true
      };
      
      // Cache the result
      boardListCache.set(cacheKey, result);
      
      return result;
    }
    
    // Fallback to current implementation if denormalized data doesn't exist
    // This is the same as current logic but wrapped in a function
    const projectBoardsRef = ref(rtdb, `projectBoards/${projectId}`);
    const projectBoardsSnapshot = await get(projectBoardsRef);
    const projectBoardsData = projectBoardsSnapshot.val();
    
    if (!projectBoardsData) {
      return { boards: [], totalCount: 0, allBoardIds: [], usedNewStructure: false };
    }
    
    // Get all board IDs and their timestamps
    const allBoardEntries = Object.entries(projectBoardsData).map(([id, data]: [string, unknown]) => {
      const boardData = data as { updatedAt?: number; createdAt?: number; isPinned?: boolean; };
      return ({
      id,
      timestamp: boardData.updatedAt || boardData.createdAt || 0,
      isPinned: boardData.isPinned || false
    });
    });
    
    // Sort all boards
    allBoardEntries.sort((a, b) => {
      if (a.isPinned && !b.isPinned) return -1;
      if (!a.isPinned && b.isPinned) return 1;
      return b.timestamp - a.timestamp;
    });
    
    const allBoardIds = allBoardEntries.map(entry => entry.id);
    const startIndex = (page - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const pageBoardIds = allBoardIds.slice(startIndex, endIndex);
    
    // Fetch actual board data
    const boardPromises = pageBoardIds.map(async (boardId) => {
      const boardRef = ref(rtdb, `boards/${boardId}`);
      const boardSnapshot = await get(boardRef);
      if (boardSnapshot.exists()) {
        const boardData = boardSnapshot.val();
        return {
          id: boardId,
          ...boardData,
          // Include metadata directly
          title: boardData.metadata?.title || boardData.name,
          description: boardData.metadata?.description,
          thumbnailUrl: boardData.metadata?.thumbnailUrl
        };
      }
      return null;
    });
    
    const boardResults = await Promise.all(boardPromises);
    const validBoards = boardResults.filter((board): board is DenormalizedBoard => board !== null);
    
    // Keep the original sort order
    const boardOrderMap = new Map(pageBoardIds.map((id, index) => [id, index]));
    validBoards.sort((a, b) => {
      const aIndex = boardOrderMap.get(a.id) ?? Number.MAX_VALUE;
      const bIndex = boardOrderMap.get(b.id) ?? Number.MAX_VALUE;
      return aIndex - bIndex;
    });
    
    const result = {
      boards: validBoards,
      totalCount: allBoardIds.length,
      allBoardIds,
      usedNewStructure: false
    };
    
    // Cache the result
    boardListCache.set(cacheKey, result);
    
    const endTime = performance.now();
    console.log(`📋 OLD structure query completed in ${(endTime - startTime).toFixed(2)}ms`);
    
    return result;
  } catch (error) {
    console.error("Error in getPaginatedBoards:", error);
    return { boards: [], totalCount: 0, allBoardIds: [], usedNewStructure: false };
  }
}

/**
 * Migrate existing board data to denormalized structure
 * This should be run once or periodically to update the denormalized data
 */
export async function denormalizeBoardData(projectId: string): Promise<void> {
  try {
    const projectBoardsRef = ref(rtdb, `projectBoards/${projectId}`);
    const projectBoardsSnapshot = await get(projectBoardsRef);
    const projectBoardsData = projectBoardsSnapshot.val();
    
    if (!projectBoardsData) return;
    
    const boardIds = Object.keys(projectBoardsData);
    const denormalizedData: Record<string, DenormalizedBoard> = {};
    
    // Fetch all board data
    const boardPromises = boardIds.map(async (boardId) => {
      const boardRef = ref(rtdb, `boards/${boardId}`);
      const boardSnapshot = await get(boardRef);
      if (boardSnapshot.exists()) {
        const boardData = boardSnapshot.val();
        denormalizedData[boardId] = {
          ...boardData,
          id: boardId,
          title: boardData.metadata?.title || boardData.name,
          description: boardData.metadata?.description,
          thumbnailUrl: boardData.metadata?.thumbnailUrl
        };
      }
    });
    
    await Promise.all(boardPromises);
    
    // Save denormalized data
    const denormalizedRef = ref(rtdb, `projectBoardsDenormalized/${projectId}`);
    await update(denormalizedRef, denormalizedData);
    
    console.log(`Denormalized ${Object.keys(denormalizedData).length} boards for project ${projectId}`);
  } catch (error) {
    console.error("Error denormalizing board data:", error);
  }
}

/**
 * Update denormalized board data when a board is updated
 */
export async function updateDenormalizedBoard(
  projectId: string,
  boardId: string,
  boardData: Partial<Board>
): Promise<void> {
  try {
    const updates: Record<string, unknown> = {};
    
    // Update denormalized data if it exists
    const denormalizedPath = `projectBoardsDenormalized/${projectId}/${boardId}`;
    const denormalizedRef = ref(rtdb, denormalizedPath);
    const snapshot = await get(denormalizedRef);
    
    if (snapshot.exists()) {
      updates[denormalizedPath] = {
        ...snapshot.val(),
        ...boardData,
        title: boardData.metadata?.title || boardData.name || snapshot.val().title,
        description: boardData.metadata?.description ?? snapshot.val().description,
        thumbnailUrl: boardData.metadata?.thumbnailUrl ?? snapshot.val().thumbnailUrl
      };
      
      await update(ref(rtdb), updates);
    }
  } catch (error) {
    console.error("Error updating denormalized board:", error);
  }
}