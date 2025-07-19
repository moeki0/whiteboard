/**
 * ボード閲覧履歴を管理するユーティリティ
 */

const BOARD_VIEW_HISTORY_KEY = 'maplap_board_view_history';

interface BoardViewHistory {
  [boardId: string]: number; // ボードIDと最後に閲覧した時刻のマップ
}

/**
 * ボードの最後の閲覧時刻を取得
 */
export function getLastBoardViewTime(boardId: string): number | null {
  try {
    const history = localStorage.getItem(BOARD_VIEW_HISTORY_KEY);
    if (!history) return null;
    
    const parsed: BoardViewHistory = JSON.parse(history);
    return parsed[boardId] || null;
  } catch (error) {
    console.error('Failed to get board view history:', error);
    return null;
  }
}

/**
 * ボードの閲覧時刻を記録
 */
export function updateBoardViewTime(boardId: string): void {
  try {
    const history = localStorage.getItem(BOARD_VIEW_HISTORY_KEY);
    const parsed: BoardViewHistory = history ? JSON.parse(history) : {};
    
    parsed[boardId] = Date.now();
    
    localStorage.setItem(BOARD_VIEW_HISTORY_KEY, JSON.stringify(parsed));
  } catch (error) {
    console.error('Failed to update board view history:', error);
  }
}

/**
 * 付箋が最後の閲覧時刻より新しいかチェック
 * 閲覧履歴がない場合（初回訪問）は常にtrueを返す
 */
export function isNoteNewerThanLastView(
  boardId: string,
  noteCreatedAt: number,
  noteUpdatedAt?: number
): boolean {
  const lastViewTime = getLastBoardViewTime(boardId);
  if (!lastViewTime) return true; // 閲覧履歴がない場合は必ずマークを表示
  
  const noteTime = noteUpdatedAt || noteCreatedAt;
  return noteTime > lastViewTime;
}

/**
 * 閲覧履歴をクリア（デバッグ用）
 */
export function clearBoardViewHistory(): void {
  try {
    localStorage.removeItem(BOARD_VIEW_HISTORY_KEY);
  } catch (error) {
    console.error('Failed to clear board view history:', error);
  }
}