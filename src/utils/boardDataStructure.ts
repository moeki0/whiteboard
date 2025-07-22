/**
 * 新しいデータ構造の設計
 * 
 * 旧構造:
 * /projectBoards/{projectId}/{boardId} -> { updatedAt, createdAt, isPinned }
 * /boards/{boardId} -> { name, metadata, ... }
 * 
 * 新構造:
 * /projectBoardsList/{projectId}/{boardId} -> {
 *   // 一覧表示に必要な全データ
 *   id: string;
 *   name: string;
 *   title: string;
 *   description?: string;
 *   thumbnailUrl?: string;
 *   createdBy: string;
 *   createdAt: number;
 *   updatedAt?: number;
 *   isPinned?: boolean;
 *   projectId: string;
 *   // ソート用のインデックス
 *   sortIndex?: number; // isPinned + updatedAtから計算
 * }
 * 
 * /boards/{boardId} -> {
 *   // 詳細データ（ボード編集時のみ必要）
 *   // 既存のデータ構造を維持
 * }
 */

import { ref, get, set, update, remove } from "firebase/database";
import { rtdb } from "../config/firebase";
import { Board } from "../types";

export interface BoardListItem {
  id: string;
  name: string;
  title: string;
  description?: string;
  thumbnailUrl?: string;
  createdBy: string;
  createdAt: number;
  updatedAt?: number;
  isPinned?: boolean;
  projectId: string;
  sortIndex?: number;
}

/**
 * ソートインデックスを計算
 * Pinned boards: 2000000000000000 - timestamp
 * Normal boards: 1000000000000000 - timestamp
 */
function calculateSortIndex(isPinned: boolean, timestamp: number): number {
  const base = isPinned ? 2000000000000000 : 1000000000000000;
  return base - timestamp;
}

/**
 * ボードリストアイテムを作成/更新
 */
export async function updateBoardListItem(
  projectId: string,
  boardId: string,
  boardData: Partial<Board>
): Promise<void> {
  const boardListRef = ref(rtdb, `projectBoardsList/${projectId}/${boardId}`);
  
  // 既存データを取得
  const snapshot = await get(boardListRef);
  const existingData = snapshot.exists() ? snapshot.val() : {};
  
  // 更新データを準備
  const updatedAt = boardData.updatedAt || Date.now();
  const isPinned = boardData.isPinned ?? existingData.isPinned ?? false;
  
  const listItem: Record<string, unknown> = {
    ...existingData,
    ...boardData,
    id: boardId,
    title: boardData.metadata?.title || boardData.name || existingData.title || existingData.name,
    updatedAt,
    sortIndex: calculateSortIndex(isPinned, updatedAt)
  };
  
  // undefinedの値は含めない
  const description = boardData.metadata?.description ?? existingData.description;
  if (description) {
    listItem.description = description;
  }
  
  const thumbnailUrl = boardData.metadata?.thumbnailUrl ?? existingData.thumbnailUrl;
  if (thumbnailUrl) {
    listItem.thumbnailUrl = thumbnailUrl;
  }
  
  await set(boardListRef, listItem);
}

/**
 * ボードリストアイテムを削除
 */
export async function removeBoardListItem(
  projectId: string,
  boardId: string
): Promise<void> {
  const boardListRef = ref(rtdb, `projectBoardsList/${projectId}/${boardId}`);
  await remove(boardListRef);
}

/**
 * ページネーション付きでボードリストを取得
 * Firebase Realtime Databaseのクエリ制限により、
 * クライアント側でページネーションを実装
 */
export async function getProjectBoardsList(
  projectId: string,
  page: number = 1,
  itemsPerPage: number = 14
): Promise<{
  boards: BoardListItem[];
  totalCount: number;
  allBoardIds: string[];
}> {
  const startTime = performance.now();
  
  const boardsListRef = ref(rtdb, `projectBoardsList/${projectId}`);
  const snapshot = await get(boardsListRef);
  
  const dbTime = performance.now();
  console.log(`🔥 Firebase query: ${(dbTime - startTime).toFixed(2)}ms`);
  
  if (!snapshot.exists()) {
    return { boards: [], totalCount: 0, allBoardIds: [] };
  }
  
  const boardsData = snapshot.val() as Record<string, BoardListItem>;
  
  // オブジェクトを配列に変換してソート
  const boardsArray = Object.entries(boardsData)
    .map(([id, board]) => ({ ...board, id }))
    .sort((a, b) => {
      // sortIndexがある場合はそれを使用
      if (a.sortIndex !== undefined && b.sortIndex !== undefined) {
        return a.sortIndex - b.sortIndex;
      }
      // fallback: isPinned -> updatedAt
      if (a.isPinned && !b.isPinned) return -1;
      if (!a.isPinned && b.isPinned) return 1;
      return (b.updatedAt || b.createdAt) - (a.updatedAt || a.createdAt);
    });
  
  const allBoardIds = boardsArray.map(b => b.id);
  
  // ページネーション
  const startIndex = (page - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedBoards = boardsArray.slice(startIndex, endIndex);
  
  return {
    boards: paginatedBoards,
    totalCount: boardsArray.length,
    allBoardIds
  };
}

/**
 * 既存のデータを新構造にマイグレーション
 */
export async function migrateToNewStructure(projectId: string): Promise<void> {
  try {
    // 1. projectBoardsから既存データを取得
    const projectBoardsRef = ref(rtdb, `projectBoards/${projectId}`);
    const projectBoardsSnapshot = await get(projectBoardsRef);
    
    if (!projectBoardsSnapshot.exists()) {
      console.log(`📋 Project ${projectId} has no boards to migrate (this is normal for new projects)`);
      return;
    }
    
    const projectBoardsData = projectBoardsSnapshot.val();
    const boardIds = Object.keys(projectBoardsData);
    
    console.log(`Migrating ${boardIds.length} boards for project ${projectId}`);
    
    // 2. 各ボードの詳細データを取得して新構造に保存
    const updates: Record<string, unknown> = {};
    
    for (const boardId of boardIds) {
      const boardRef = ref(rtdb, `boards/${boardId}`);
      const boardSnapshot = await get(boardRef);
      
      if (boardSnapshot.exists()) {
        const boardData = boardSnapshot.val();
        const projectBoardData = projectBoardsData[boardId];
        
        const updatedAt = boardData.updatedAt || projectBoardData.updatedAt || boardData.createdAt;
        const isPinned = boardData.isPinned || projectBoardData.isPinned || false;
        
        const listItem: BoardListItem = {
          id: boardId,
          name: boardData.name,
          title: boardData.metadata?.title || boardData.name,
          createdBy: boardData.createdBy,
          createdAt: boardData.createdAt,
          updatedAt,
          isPinned,
          projectId,
          sortIndex: calculateSortIndex(isPinned, updatedAt)
        };
        
        // undefinedの値は含めない
        if (boardData.metadata?.description) {
          listItem.description = boardData.metadata.description;
        }
        if (boardData.metadata?.thumbnailUrl) {
          listItem.thumbnailUrl = boardData.metadata.thumbnailUrl;
        }
        
        updates[`projectBoardsList/${projectId}/${boardId}`] = listItem;
      }
    }
    
    // 3. バッチ更新
    await update(ref(rtdb), updates);
    
    console.log(`Migration completed for project ${projectId}`);
  } catch (error) {
    console.error(`Migration failed for project ${projectId}:`, error);
    throw error;
  }
}

/**
 * 全プロジェクトのデータをマイグレーション
 */
export async function migrateAllProjects(): Promise<void> {
  try {
    const projectsRef = ref(rtdb, 'projects');
    const snapshot = await get(projectsRef);
    
    if (!snapshot.exists()) {
      console.log('No projects found');
      return;
    }
    
    const projects = snapshot.val();
    const projectIds = Object.keys(projects);
    
    console.log(`Starting migration for ${projectIds.length} projects`);
    
    for (const projectId of projectIds) {
      await migrateToNewStructure(projectId);
    }
    
    console.log('All projects migrated successfully');
  } catch (error) {
    console.error('Migration failed:', error);
    throw error;
  }
}