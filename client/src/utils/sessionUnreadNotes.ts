/**
 * セッション中の未読マーク表示を管理
 * - ページ読み込み時に未読だった付箋は、そのセッション中はずっと未読マークを表示
 * - 付箋の閲覧履歴はバックグラウンドで記録（次回アクセス時用）
 */

const sessionUnreadNotes = new Set<string>();
let sessionInitialized = false;

/**
 * セッション開始時に未読付箋を初期化
 */
export function initializeSessionUnreadNotes(boardId: string, notes: any[], isNoteUnreadFn: Function): void {
  if (sessionInitialized) return;
  
  sessionUnreadNotes.clear();
  
  // ページ読み込み時点で未読だった付箋をセッション未読として記録
  notes.forEach(note => {
    const isUnread = isNoteUnreadFn(boardId, note.id, note.updatedAt || note.createdAt);
    if (isUnread) {
      sessionUnreadNotes.add(note.id);
      console.log('Session unread note:', note.id.substring(0, 8));
    }
  });
  
  sessionInitialized = true;
  console.log('Session initialized with', sessionUnreadNotes.size, 'unread notes');
}

/**
 * セッション中の未読状態をチェック
 */
export function isNoteUnreadInSession(noteId: string): boolean {
  return sessionUnreadNotes.has(noteId);
}

/**
 * セッションをリセット（新しいボードアクセス時）
 */
export function resetSession(): void {
  sessionUnreadNotes.clear();
  sessionInitialized = false;
  console.log('Session reset');
}

/**
 * 新しい付箋をセッション未読に追加
 */
export function addNewNoteToSession(noteId: string): void {
  sessionUnreadNotes.add(noteId);
  console.log('Added new note to session unread:', noteId.substring(0, 8));
}