import { useState, useCallback } from "react";

interface UseErrorHandlerReturn {
  error: string | null;
  showError: (message: string) => void;
  clearError: () => void;
  handleAsyncError: <T>(asyncFn: () => Promise<T>) => Promise<T | null>;
}

export function useErrorHandler(): UseErrorHandlerReturn {
  const [error, setError] = useState<string | null>(null);

  const showError = useCallback((message: string) => {
    setError(message);
    // Auto-clear error after 5 seconds
    setTimeout(() => setError(null), 5000);
  }, []);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const handleAsyncError = useCallback(async <T>(
    asyncFn: () => Promise<T>
  ): Promise<T | null> => {
    try {
      clearError();
      return await asyncFn();
    } catch (err) {
      const message = err instanceof Error ? err.message : "An unknown error occurred";
      showError(message);
      return null;
    }
  }, [showError, clearError]);

  return {
    error,
    showError,
    clearError,
    handleAsyncError,
  };
}