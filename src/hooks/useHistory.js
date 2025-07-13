import { useState, useCallback } from 'react';

export function useHistory(maxHistorySize = 50) {
  const [history, setHistory] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(-1);

  const addToHistory = useCallback((action) => {
    setHistory(prev => {
      const newHistory = [...prev.slice(0, currentIndex + 1), action];
      // Limit history size
      if (newHistory.length > maxHistorySize) {
        return newHistory.slice(-maxHistorySize);
      }
      return newHistory;
    });
    setCurrentIndex(prev => prev + 1);
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