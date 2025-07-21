import { useState, useEffect } from 'react';
import { Board } from '../types';
import { getCombinedSuggestions, SuggestionItem } from '../utils/textCompletion';
import { useDebounce } from './useDebounce';

interface UseCombinedSuggestionsResult {
  suggestions: SuggestionItem[];
  isLoading: boolean;
  error: string | null;
}

/**
 * 統合候補（ボード + Scrapbox）を取得するフック
 * @param boards ボード一覧
 * @param searchText 検索文字列
 * @param scrapboxProjectName Scrapboxプロジェクト名
 * @param enabled 検索を有効にするかどうか
 * @returns 統合候補の結果
 */
export function useCombinedSuggestions(
  boards: Board[],
  searchText: string,
  scrapboxProjectName?: string,
  enabled: boolean = true
): UseCombinedSuggestionsResult {
  const [suggestions, setSuggestions] = useState<SuggestionItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // 検索文字列をデバウンス（300ms）
  const debouncedSearchText = useDebounce(searchText, 300);

  useEffect(() => {
    console.log('[useCombinedSuggestions] Effect triggered:', { 
      enabled, 
      debouncedSearchText, 
      scrapboxProjectName,
      boardCount: boards.length 
    });

    if (!enabled || !debouncedSearchText.trim()) {
      console.log('[useCombinedSuggestions] Clearing suggestions (disabled or empty search)');
      setSuggestions([]);
      setIsLoading(false);
      setError(null);
      return;
    }

    let isCancelled = false;
    
    const fetchSuggestions = async () => {
      console.log('[useCombinedSuggestions] Starting fetch...');
      setIsLoading(true);
      setError(null);
      
      try {
        const result = await getCombinedSuggestions(
          boards,
          debouncedSearchText,
          scrapboxProjectName
        );
        
        console.log('[useCombinedSuggestions] Fetch completed:', result.length, 'suggestions');
        
        if (!isCancelled) {
          setSuggestions(result);
        }
      } catch (err) {
        console.error('[useCombinedSuggestions] Fetch error:', err);
        if (!isCancelled) {
          setError(err instanceof Error ? err.message : 'Unknown error');
          setSuggestions([]);
        }
      } finally {
        if (!isCancelled) {
          console.log('[useCombinedSuggestions] Setting loading to false');
          setIsLoading(false);
        }
      }
    };

    fetchSuggestions();

    return () => {
      console.log('[useCombinedSuggestions] Cleanup - cancelling fetch');
      isCancelled = true;
    };
  }, [boards, debouncedSearchText, scrapboxProjectName, enabled]);

  return { suggestions, isLoading, error };
}