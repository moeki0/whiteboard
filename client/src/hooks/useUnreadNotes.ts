import { useMemo, useCallback } from 'react';
import { Note, User } from '../types';
import { isNoteUnread, updateNoteViewTime } from '../utils/noteViewHistory';

interface UseUnreadNotesProps {
  boardId: string;
  notes: Note[];
  user: User | null;
  zoom: number;
  panX: number;
  panY: number;
}

interface UseUnreadNotesReturn {
  unreadNotes: Note[];
  focusNote: (noteId: string) => void;
  markNoteAsRead: (noteId: string) => void;
}

export function useUnreadNotes({
  boardId,
  notes,
  user,
  zoom,
  panX,
  panY,
}: UseUnreadNotesProps): UseUnreadNotesReturn {
  // 未読の付箋を計算
  const unreadNotes = useMemo(() => {
    if (!user?.uid) {
      console.log('useUnreadNotes: No user, returning empty array');
      return [];
    }
    
    const unread = notes.filter(note => {
      const updatedAt = note.updatedAt || note.createdAt;
      const isUnread = isNoteUnread(boardId, note.id, updatedAt);
      if (isUnread) {
        console.log('Found unread note:', note.id, note.content?.substring(0, 20));
      }
      return isUnread;
    });
    
    console.log('useUnreadNotes result:', { totalNotes: notes.length, unreadCount: unread.length });
    return unread;
  }, [boardId, notes, user?.uid]);

  // 付箋にフォーカスする関数
  const focusNote = useCallback((noteId: string) => {
    const note = notes.find(n => n.id === noteId);
    if (!note) return;

    // 付箋の位置を中央に表示するためのパン・ズーム計算
    const targetZoom = 1.0; // フォーカス時のズームレベル
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    
    // 付箋を画面中央に配置するためのパン位置を計算
    const targetPanX = viewportWidth / 2 - note.x * targetZoom;
    const targetPanY = viewportHeight / 2 - note.y * targetZoom;

    // カスタムイベントを発火してBoardコンポーネントにフォーカス要求を送信
    const focusEvent = new CustomEvent('focusNote', {
      detail: {
        noteId,
        zoom: targetZoom,
        panX: targetPanX,
        panY: targetPanY,
      }
    });
    
    window.dispatchEvent(focusEvent);

    // 付箋を既読にマーク
    markNoteAsRead(noteId);
  }, [notes, boardId]);

  // 付箋を既読にマークする関数
  const markNoteAsRead = useCallback((noteId: string) => {
    if (!user?.uid) return;
    updateNoteViewTime(boardId, noteId);
  }, [boardId, user?.uid]);

  return {
    unreadNotes,
    focusNote,
    markNoteAsRead,
  };
}