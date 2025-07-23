/**
 * 付箋レベルの閲覧履歴を管理するユーティリティ
 */

const NOTE_VIEW_HISTORY_KEY = 'maplap_note_view_history';

interface NoteViewHistory {
  [boardId: string]: {
    [noteId: string]: number; // 付箋IDと最後に閲覧した時刻のマップ
  };
}

/**
 * 指定ボードの付箋閲覧履歴を取得
 */
export function getNoteViewHistory(boardId: string): { [noteId: string]: number } {
  try {
    const history = localStorage.getItem(NOTE_VIEW_HISTORY_KEY);
    if (!history) return {};
    
    const parsed: NoteViewHistory = JSON.parse(history);
    return parsed[boardId] || {};
  } catch (error) {
    console.error('Failed to get note view history:', error);
    return {};
  }
}

/**
 * 付箋の閲覧時刻を記録
 */
export function updateNoteViewTime(boardId: string, noteId: string): void {
  try {
    const history = localStorage.getItem(NOTE_VIEW_HISTORY_KEY);
    const parsed: NoteViewHistory = history ? JSON.parse(history) : {};
    
    if (!parsed[boardId]) {
      parsed[boardId] = {};
    }
    
    parsed[boardId][noteId] = Date.now();
    
    localStorage.setItem(NOTE_VIEW_HISTORY_KEY, JSON.stringify(parsed));
  } catch (error) {
    console.error('Failed to update note view history:', error);
  }
}

/**
 * 付箋が未読かどうかをチェック
 * 閲覧履歴がない場合は未読とみなす
 */
export function isNoteUnread(
  boardId: string,
  noteId: string,
  noteUpdatedAt: number
): boolean {
  const noteHistory = getNoteViewHistory(boardId);
  const lastViewTime = noteHistory[noteId];
  
  if (!lastViewTime) return true; // 閲覧履歴がない場合は未読
  
  return noteUpdatedAt > lastViewTime;
}

/**
 * 閲覧履歴をクリア（デバッグ用）
 */
export function clearNoteViewHistory(): void {
  try {
    localStorage.removeItem(NOTE_VIEW_HISTORY_KEY);
  } catch (error) {
    console.error('Failed to clear note view history:', error);
  }
}