import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { resolveProjectSlug, resolveBoardName } from '../utils/slugResolver';
import { 
  findProjectIdByHistoricalSlug, 
  findBoardIdByHistoricalName, 
  getLatestProjectSlug, 
  getLatestBoardName 
} from '../utils/historyManager';
import { SlugProvider } from '../contexts/SlugContext';

interface SlugRouterProps {
  type: 'project' | 'board';
  children: React.ReactNode;
}

export const SlugRouter: React.FC<SlugRouterProps> = ({ type, children }) => {
  const { projectSlug, boardName } = useParams<{ projectSlug: string; boardName?: string }>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [resolved, setResolved] = useState<{
    projectId: string | null;
    boardId: string | null;
  }>({ projectId: null, boardId: null });

  useEffect(() => {
    const resolveAndRedirect = async () => {
      if (!projectSlug) {
        setLoading(false);
        return;
      }

      try {
        // Try to resolve current slug
        let projectId = await resolveProjectSlug(projectSlug);
        
        // If not found, try historical slugs
        if (!projectId) {
          projectId = await findProjectIdByHistoricalSlug(projectSlug);
          
          // If found in history, redirect to current slug
          if (projectId) {
            const currentSlug = await getLatestProjectSlug(projectId);
            if (currentSlug && currentSlug !== projectSlug) {
              if (type === 'project') {
                navigate(`/${currentSlug}`, { replace: true });
                return;
              } else if (type === 'board' && boardName) {
                navigate(`/${currentSlug}/${boardName}`, { replace: true });
                return;
              }
            }
          }
        }

        if (!projectId) {
          // Project not found, redirect to home
          navigate('/', { replace: true });
          return;
        }

        let boardId: string | null = null;
        
        if (type === 'board' && boardName) {
          // Try to resolve current board name
          boardId = await resolveBoardName(projectId, boardName);
          
          // If not found, try historical names
          if (!boardId) {
            boardId = await findBoardIdByHistoricalName(projectId, boardName);
            
            // If found in history, redirect to current name
            if (boardId) {
              const currentName = await getLatestBoardName(boardId);
              if (currentName && currentName !== boardName) {
                const currentProjectSlug = await getLatestProjectSlug(projectId);
                if (currentProjectSlug) {
                  navigate(`/${currentProjectSlug}/${encodeURIComponent(currentName)}`, { replace: true });
                  return;
                }
              }
            }
          }

          if (!boardId) {
            // Board not found, redirect to project
            const currentProjectSlug = await getLatestProjectSlug(projectId);
            if (currentProjectSlug) {
              navigate(`/${currentProjectSlug}`, { replace: true });
              return;
            }
          }
        }

        setResolved({ projectId, boardId });
      } catch (error) {
        console.error('Error resolving slug:', error);
        navigate('/', { replace: true });
      } finally {
        setLoading(false);
      }
    };

    resolveAndRedirect();
  }, [projectSlug, boardName, type, navigate]);

  if (loading) {
    return (
      <SlugProvider projectId={resolved.projectId} boardId={resolved.boardId} loading={true}>
        {children}
      </SlugProvider>
    );
  }

  if (!resolved.projectId) {
    return null;
  }

  if (type === 'board' && !resolved.boardId) {
    return null;
  }

  // Pass resolved IDs to children through Context
  return (
    <SlugProvider projectId={resolved.projectId} boardId={resolved.boardId} loading={false}>
      {children}
    </SlugProvider>
  );
};