import { useState, useCallback, useEffect } from "react";

const SEARCH_HISTORY_KEY = "torchscan-search-history";
const MAX_HISTORY_ITEMS = 10;

export interface SearchHistoryItem {
  query: string;
  timestamp: number;
  resultsCount?: number;
}

export function useSearchHistory() {
  const [history, setHistory] = useState<SearchHistoryItem[]>(() => {
    try {
      const stored = localStorage.getItem(SEARCH_HISTORY_KEY);
      if (stored) {
        return JSON.parse(stored);
      }
    } catch {
      // ignore
    }
    return [];
  });

  const saveHistory = useCallback((newHistory: SearchHistoryItem[]) => {
    try {
      localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(newHistory));
    } catch {
      // ignore
    }
  }, []);

  const addToHistory = useCallback((query: string, resultsCount?: number) => {
    if (!query.trim()) return;

    setHistory((prev) => {
      const filtered = prev.filter((item) => item.query !== query);
      const newItem: SearchHistoryItem = {
        query: query.trim(),
        timestamp: Date.now(),
        resultsCount,
      };
      const newHistory = [newItem, ...filtered].slice(0, MAX_HISTORY_ITEMS);
      saveHistory(newHistory);
      return newHistory;
    });
  }, [saveHistory]);

  const removeFromHistory = useCallback((query: string) => {
    setHistory((prev) => {
      const newHistory = prev.filter((item) => item.query !== query);
      saveHistory(newHistory);
      return newHistory;
    });
  }, [saveHistory]);

  const clearHistory = useCallback(() => {
    setHistory([]);
    saveHistory([]);
  }, [saveHistory]);

  return {
    history,
    addToHistory,
    removeFromHistory,
    clearHistory,
  };
}

export function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}
