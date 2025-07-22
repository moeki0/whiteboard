import React, { createContext, useContext, ReactNode } from 'react';

interface SlugContextType {
  resolvedProjectId: string | null;
  resolvedBoardId: string | null;
  loading?: boolean;
}

const SlugContext = createContext<SlugContextType | undefined>(undefined);

export const useSlug = () => {
  const context = useContext(SlugContext);
  return context || { resolvedProjectId: null, resolvedBoardId: null, loading: false };
};

export const useSlugContext = useSlug;

interface SlugProviderProps {
  projectId: string | null;
  boardId: string | null;
  loading?: boolean;
  children: ReactNode;
}

export const SlugProvider: React.FC<SlugProviderProps> = ({ projectId, boardId, loading, children }) => {
  const value = {
    resolvedProjectId: projectId,
    resolvedBoardId: boardId,
    loading,
  };

  return (
    <SlugContext.Provider value={value}>
      {children}
    </SlugContext.Provider>
  );
};