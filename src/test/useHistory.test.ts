import { renderHook, act } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { useHistory } from '../hooks/useHistory';
import { HistoryAction } from '../types';

describe('useHistory', () => {
  it('adds actions to history', () => {
    const { result } = renderHook(() => useHistory());
    
    const action: HistoryAction = {
      type: 'CREATE_NOTE',
      noteId: '1',
      userId: 'user1',
    };

    act(() => {
      result.current.addToHistory(action);
    });

    expect(result.current.canUndo).toBe(true);
    expect(result.current.canRedo).toBe(false);
  });

  it('performs undo/redo correctly', () => {
    const { result } = renderHook(() => useHistory());
    
    const action: HistoryAction = {
      type: 'CREATE_NOTE',
      noteId: '1',
      userId: 'user1',
    };

    act(() => {
      result.current.addToHistory(action);
    });

    let undoResult: HistoryAction | null = null;
    act(() => {
      undoResult = result.current.undo();
    });

    expect(undoResult).toEqual(action);
    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(true);
  });
});