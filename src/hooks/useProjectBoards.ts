import { useState, useEffect } from 'react';
import { ref, get } from 'firebase/database';
import { rtdb } from '../config/firebase';
import { Board } from '../types';

/**
 * プロジェクト内のボード一覧を取得するHook
 * @param projectId プロジェクトID
 * @returns ボード一覧とローディング状態
 */
export function useProjectBoards(projectId: string | null) {
  const [boards, setBoards] = useState<Board[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!projectId) {
      setBoards([]);
      return;
    }

    const fetchBoards = async () => {
      setLoading(true);
      setError(null);
      
      try {
        // プロジェクト内のボードID一覧を取得
        const projectBoardsRef = ref(rtdb, `projectBoards/${projectId}`);
        const projectBoardsSnapshot = await get(projectBoardsRef);
        
        if (!projectBoardsSnapshot.exists()) {
          setBoards([]);
          return;
        }

        const boardIds = Object.keys(projectBoardsSnapshot.val());
        
        // 各ボードの詳細情報を取得
        const boardPromises = boardIds.map(async (boardId) => {
          const boardRef = ref(rtdb, `boards/${boardId}`);
          const boardSnapshot = await get(boardRef);
          
          if (boardSnapshot.exists()) {
            return { id: boardId, ...boardSnapshot.val() } as Board;
          }
          return null;
        });

        const boardResults = await Promise.all(boardPromises);
        const validBoards = boardResults.filter((board): board is Board => board !== null);
        
        // 更新日時でソート（最新順）
        validBoards.sort((a, b) => {
          const aTime = a.updatedAt || a.createdAt;
          const bTime = b.updatedAt || b.createdAt;
          return bTime - aTime;
        });

        setBoards(validBoards);
      } catch (err) {
        console.error('Error fetching project boards:', err);
        setError('ボード一覧の取得に失敗しました');
      } finally {
        setLoading(false);
      }
    };

    fetchBoards();
  }, [projectId]);

  return { boards, loading, error };
}