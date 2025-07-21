import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useCombinedSuggestions } from '../hooks/useCombinedSuggestions';
import { Board } from '../types';

// getCombinedSuggestionsをモック
vi.mock('../utils/textCompletion', () => ({
  getCombinedSuggestions: vi.fn()
}));

describe('useCombinedSuggestions', () => {
  const mockBoards: Board[] = [
    { id: '1', name: 'テストボード', createdBy: 'user1', createdAt: Date.now() }
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should show loading state during search', async () => {
    const { getCombinedSuggestions } = await import('../utils/textCompletion');
    
    // 非同期処理を遅延させるためのPromise
    const delayedPromise = new Promise(resolve => 
      setTimeout(() => resolve([]), 100)
    );
    
    (getCombinedSuggestions as any).mockReturnValue(delayedPromise);

    const { result } = renderHook(() =>
      useCombinedSuggestions(mockBoards, 'test', 'test-project', true)
    );

    // 初期状態の確認
    expect(result.current.isLoading).toBe(true);
    expect(result.current.suggestions).toEqual([]);
    expect(result.current.error).toBe(null);

    // 非同期処理の完了を待つ
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
  });

  it('should not search when enabled is false', () => {
    const { result } = renderHook(() =>
      useCombinedSuggestions(mockBoards, 'test', 'test-project', false)
    );

    expect(result.current.isLoading).toBe(false);
    expect(result.current.suggestions).toEqual([]);
  });
});