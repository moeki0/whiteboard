import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { resolveProjectSlug, resolveBoardName } from '../utils/slugResolver';
import { 
  findProjectIdByHistoricalSlug, 
  findBoardIdByHistoricalName, 
  getLatestProjectSlug, 
  getLatestBoardName 
} from '../utils/historyManager';
import { SlugProvider } from '../contexts/SlugContext';
import { useProject } from '../contexts/ProjectContext';
import { auth, rtdb } from '../config/firebase';
import { ref, get } from 'firebase/database';
import { createBoardFromTitle } from '../utils/boardCreator';

interface SlugRouterProps {
  type: 'project' | 'board';
  children: React.ReactNode;
}

export const SlugRouter: React.FC<SlugRouterProps> = ({ type, children }) => {
  console.log('[SlugRouter] Component rendering, type:', type, 'time:', new Date().toISOString());
  const { projectSlug, boardName } = useParams<{ projectSlug: string; boardName?: string }>();
  console.log('[SlugRouter] Params:', { projectSlug, boardName });
  const navigate = useNavigate();
  const { updateCurrentProject } = useProject();
  const [loading, setLoading] = useState(true);
  const [resolved, setResolved] = useState<{
    projectId: string | null;
    boardId: string | null;
  }>({ projectId: null, boardId: null });
  const creatingRef = useRef<string | null>(null);
  const hasAttemptedCreationRef = useRef<Set<string>>(new Set());

  const resolveAndRedirect = useCallback(async () => {
      console.log('[SlugRouter] resolveAndRedirect called at:', new Date().toISOString());
      if (!projectSlug) {
        setLoading(false);
        return;
      }

      try {
        // Try to resolve current slug
        console.log('[SlugRouter] Starting to resolve project slug:', projectSlug);
        const resolveStart = performance.now();
        let projectId = await resolveProjectSlug(projectSlug);
        console.log('[SlugRouter] Project slug resolution took:', performance.now() - resolveStart, 'ms');
        
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
          console.log('[SlugRouter] Resolving board name:', boardName);
          const boardResolveStart = performance.now();
          // Try to resolve current board name
          boardId = await resolveBoardName(projectId, boardName);
          console.log('[SlugRouter] Board name resolution took:', performance.now() - boardResolveStart, 'ms, found:', !!boardId);
          
          // If not found, try historical names (but skip if we're about to create a new board)
          if (!boardId) {
            console.log('[SlugRouter] Trying historical names');
            const historyStart = performance.now();
            boardId = await findBoardIdByHistoricalName(projectId, boardName);
            console.log('[SlugRouter] Historical name lookup took:', performance.now() - historyStart, 'ms, found:', !!boardId);
            
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
            // Board not found, try to create it if boardName exists
            if (boardName) {
              const creatingKey = `${projectId}_${boardName}`;
              
              // 既に作成を試みた場合はスキップ
              if (hasAttemptedCreationRef.current.has(creatingKey)) {
                console.log('[SlugRouter] Already attempted to create this board, skipping:', boardName);
                return;
              }
              
              console.log('[SlugRouter] Board not found, attempting to create:', boardName);
              // Check if we're already creating this board to prevent duplicates
              if (creatingRef.current === creatingKey) {
                console.log('[SlugRouter] Board creation already in progress, skipping...');
                return;
              }
              
              try {
                const currentUser = auth.currentUser;
                if (currentUser) {
                  creatingRef.current = creatingKey;
                  hasAttemptedCreationRef.current.add(creatingKey);
                  const createStart = performance.now();
                  boardId = await createBoardFromTitle(projectId, boardName, currentUser.uid);
                  console.log('[SlugRouter] Board creation completed in:', performance.now() - createStart, 'ms');
                  
                  // ボード作成後、作成されたボードの実際の名前を取得
                  const actualBoardName = await getLatestBoardName(boardId);
                  if (actualBoardName && actualBoardName !== boardName) {
                    // 作成されたボードの実際の名前が異なる場合、正しいURLにリダイレクト
                    const currentProjectSlug = await getLatestProjectSlug(projectId);
                    if (currentProjectSlug) {
                      navigate(`/${currentProjectSlug}/${encodeURIComponent(actualBoardName)}`, { replace: true });
                      return;
                    }
                  }
                } else {
                  // User not authenticated, redirect to project
                  const currentProjectSlug = await getLatestProjectSlug(projectId);
                  if (currentProjectSlug) {
                    navigate(`/${currentProjectSlug}`, { replace: true });
                    return;
                  }
                }
              } catch (error) {
                console.error('Error creating board:', error);
                // If board creation fails, redirect to project
                const currentProjectSlug = await getLatestProjectSlug(projectId);
                if (currentProjectSlug) {
                  navigate(`/${currentProjectSlug}`, { replace: true });
                  return;
                }
              } finally {
                creatingRef.current = null;
              }
            } else {
              // No boardName, redirect to project
              const currentProjectSlug = await getLatestProjectSlug(projectId);
              if (currentProjectSlug) {
                navigate(`/${currentProjectSlug}`, { replace: true });
                return;
              }
            }
          }
        }

        // Update current project in context when projectId is resolved
        if (projectId) {
          try {
            const projectRef = ref(rtdb, `projects/${projectId}`);
            const projectSnapshot = await get(projectRef);
            if (projectSnapshot.exists()) {
              const projectData = projectSnapshot.val();
              updateCurrentProject(projectId, projectData.name);
            } else {
              updateCurrentProject(projectId);
            }
          } catch (error) {
            console.error('Error updating current project:', error);
            updateCurrentProject(projectId);
          }
        }

        setResolved({ projectId, boardId });
        console.log('[SlugRouter] Resolution complete, projectId:', projectId, 'boardId:', boardId);
      } catch (error) {
        console.error('Error resolving slug:', error);
        navigate('/', { replace: true });
      } finally {
        setLoading(false);
        console.log('[SlugRouter] Loading set to false');
      }
    }, [projectSlug, boardName, type, navigate, updateCurrentProject]);

  useEffect(() => {
    console.log('[SlugRouter] useEffect triggered at:', new Date().toISOString());
    resolveAndRedirect();
  }, [resolveAndRedirect]);

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