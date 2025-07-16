import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { useErrorHandler } from '../hooks/useErrorHandler';

describe('useErrorHandler', () => {
  it('エラーメッセージを正しく設定する', () => {
    const { result } = renderHook(() => useErrorHandler());
    
    expect(result.current.error).toBe(null);
    
    act(() => {
      result.current.showError('Test error message');
    });
    
    expect(result.current.error).toBe('Test error message');
  });

  it('エラーメッセージを正しくクリアする', () => {
    const { result } = renderHook(() => useErrorHandler());
    
    act(() => {
      result.current.showError('Test error message');
    });
    
    expect(result.current.error).toBe('Test error message');
    
    act(() => {
      result.current.clearError();
    });
    
    expect(result.current.error).toBe(null);
  });

  it('成功したasync関数の結果を返す', async () => {
    const { result } = renderHook(() => useErrorHandler());
    
    const mockAsyncFn = vi.fn().mockResolvedValue('success result');
    
    let asyncResult: string | null = null;
    await act(async () => {
      asyncResult = await result.current.handleAsyncError(mockAsyncFn);
    });
    
    expect(asyncResult).toBe('success result');
    expect(result.current.error).toBe(null);
  });

  it('失敗したasync関数のエラーを正しく処理する', async () => {
    const { result } = renderHook(() => useErrorHandler());
    
    const mockAsyncFn = vi.fn().mockRejectedValue(new Error('Test error'));
    
    let asyncResult: string | null = null;
    await act(async () => {
      asyncResult = await result.current.handleAsyncError(mockAsyncFn);
    });
    
    expect(asyncResult).toBe(null);
    expect(result.current.error).toBe('Test error');
  });

  it('非Errorオブジェクトの例外を正しく処理する', async () => {
    const { result } = renderHook(() => useErrorHandler());
    
    const mockAsyncFn = vi.fn().mockRejectedValue('String error');
    
    let asyncResult: string | null = null;
    await act(async () => {
      asyncResult = await result.current.handleAsyncError(mockAsyncFn);
    });
    
    expect(asyncResult).toBe(null);
    expect(result.current.error).toBe('An unknown error occurred');
  });

  it('handleAsyncErrorは既存のエラーをクリアしてから処理する', async () => {
    const { result } = renderHook(() => useErrorHandler());
    
    // 最初にエラーを設定
    act(() => {
      result.current.showError('Old error');
    });
    
    expect(result.current.error).toBe('Old error');
    
    // 成功するasync関数を実行
    const mockAsyncFn = vi.fn().mockResolvedValue('success');
    
    await act(async () => {
      await result.current.handleAsyncError(mockAsyncFn);
    });
    
    expect(result.current.error).toBe(null);
  });
});