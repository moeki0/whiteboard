import React, { createContext, useContext, ReactNode } from 'react';

interface SlugContextType {
  resolvedProjectId: string | null;
  resolvedBoardId: string | null;
}

const SlugContext = createContext<SlugContextType | undefined>(undefined);

export const useSlug = () => {
  const context = useContext(SlugContext);
  return context || { resolvedProjectId: null, resolvedBoardId: null };
};

interface SlugProviderProps {
  projectId: string | null;
  boardId: string | null;
  children: ReactNode;
}

export const SlugProvider: React.FC<SlugProviderProps> = ({ projectId, boardId, children }) => {
  const value = {
    resolvedProjectId: projectId,
    resolvedBoardId: boardId,
  };

  return (
    <SlugContext.Provider value={value}>
      {children}
    </SlugContext.Provider>
  );
};