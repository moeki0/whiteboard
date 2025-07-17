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
import { onAuthStateChanged, User } from 'firebase/auth';
import { auth } from '../config/firebase';
import { createBoardFromTitle } from '../utils/boardCreator';

interface SlugRouterProps {
  type: 'project' | 'board';
  children: React.ReactNode;
}

export const SlugRouter: React.FC<SlugRouterProps> = ({ type, children }) => {
  const { projectSlug, boardName } = useParams<{ projectSlug: string; boardName?: string }>();
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [loading, setLoading] = useState(true);
  const [resolved, setResolved] = useState<{
    projectId: string | null;
    boardId: string | null;
  }>({ projectId: null, boardId: null });

  // 認証状態の監視
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUser(user);
      setAuthLoading(false);
    });
    return () => unsubscribe();
  }, []);

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
            // Board not found, try to create it if user is authenticated
            if (user && boardName) {
              try {
                boardId = await createBoardFromTitle(projectId, boardName, user.uid);
                
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
              } catch (error) {
                console.error('Error creating board:', error);
                // If board creation fails, redirect to project
                const currentProjectSlug = await getLatestProjectSlug(projectId);
                if (currentProjectSlug) {
                  navigate(`/${currentProjectSlug}`, { replace: true });
                  return;
                }
              }
            } else {
              // User not authenticated or no boardName, redirect to project
              const currentProjectSlug = await getLatestProjectSlug(projectId);
              if (currentProjectSlug) {
                navigate(`/${currentProjectSlug}`, { replace: true });
                return;
              }
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

    // 認証状態が初期化されるまで待つ
    if (authLoading) {
      return;
    }
    
    resolveAndRedirect();
  }, [projectSlug, boardName, type, navigate, user, authLoading]);

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