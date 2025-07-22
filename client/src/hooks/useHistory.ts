import { useState, useCallback } from 'react';
import { HistoryAction } from '../types';

interface UseHistoryReturn {
  addToHistory: (action: HistoryAction) => void;
  undo: () => HistoryAction | null;
  redo: () => HistoryAction | null;
  canUndo: boolean;
  canRedo: boolean;
  clearHistory: () => void;
  historyLength: number;
  currentIndex: number;
}

export function useHistory(maxHistorySize = 50): UseHistoryReturn {
  const [history, setHistory] = useState<HistoryAction[]>([]);
  const [currentIndex, setCurrentIndex] = useState<number>(-1);

  const addToHistory = useCallback((action: HistoryAction) => {
    setHistory(prev => {
      const newHistory = [...prev.slice(0, currentIndex + 1), action];
      // Limit history size
      if (newHistory.length > maxHistorySize) {
        const slicedHistory = newHistory.slice(-maxHistorySize);
        setCurrentIndex(slicedHistory.length - 1);
        return slicedHistory;
      }
      setCurrentIndex(newHistory.length - 1);
      return newHistory;
    });
  }, [currentIndex, maxHistorySize]);

  const undo = useCallback(() => {
    if (currentIndex >= 0) {
      const action = history[currentIndex];
      setCurrentIndex(prev => prev - 1);
      return action;
    }
    return null;
  }, [currentIndex, history]);

  const redo = useCallback(() => {
    if (currentIndex < history.length - 1) {
      const nextIndex = currentIndex + 1;
      const action = history[nextIndex];
      setCurrentIndex(nextIndex);
      return action;
    }
    return null;
  }, [currentIndex, history]);

  const canUndo = currentIndex >= 0;
  const canRedo = currentIndex < history.length - 1;

  const clearHistory = useCallback(() => {
    setHistory([]);
    setCurrentIndex(-1);
  }, []);

  return {
    addToHistory,
    undo,
    redo,
    canUndo,
    canRedo,
    clearHistory,
    historyLength: history.length,
    currentIndex
  };
}