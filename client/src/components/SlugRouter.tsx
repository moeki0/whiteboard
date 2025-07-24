import React, { useEffect, useState, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { resolveProjectSlug, resolveBoardName } from "../utils/slugResolver";
import {
  findProjectIdByHistoricalSlug,
  findBoardIdByHistoricalName,
  getLatestProjectSlug,
  getLatestBoardName,
} from "../utils/historyManager";
import { SlugProvider } from "../contexts/SlugContext";
import { useProject } from "../contexts/ProjectContext";
import { auth, rtdb } from "../config/firebase";
import { ref, get } from "firebase/database";
import { createBoardFromTitle } from "../utils/boardCreator";
import { useTrackProjectAccess } from "../hooks/useRecentProject";
import "../utils/buildSlugIndex"; // 開発ツールを読み込み
import "../utils/boardSortScore"; // ソートスコアツールを読み込み

interface SlugRouterProps {
  type: "project" | "board";
  children: React.ReactNode;
}

export const SlugRouter: React.FC<SlugRouterProps> = React.memo(({ type, children }) => {
  // console.log("🌐 SlugRouter rendered:", { type }); // デバッグログを削減
  const { projectSlug, boardName } = useParams<{
    projectSlug: string;
    boardName?: string;
  }>();
  console.log("🌐 SlugRouter params:", { type, projectSlug, boardName });
  const navigate = useNavigate();
  const { updateCurrentProject } = useProject();
  const [loading, setLoading] = useState(true);
  const [resolved, setResolved] = useState<{
    projectId: string | null;
    boardId: string | null;
  }>({ projectId: null, boardId: null });
  const creatingRef = useRef<string | null>(null);
  const hasAttemptedCreationRef = useRef<Set<string>>(new Set());
  const resolveRunning = useRef<boolean>(false); // 重複実行防止フラグ

  const resolveAndRedirect = useCallback(async () => {
    console.log("🔄 resolveAndRedirect called with:", { type, projectSlug, boardName });
    if (!projectSlug) {
      setLoading(false);
      return;
    }

    try {
      const startTime = performance.now();
      console.log("🔍 Starting slug resolution for:", projectSlug);
      let projectId = await resolveProjectSlug(projectSlug);
      console.log(`⏱️ resolveProjectSlug took: ${(performance.now() - startTime).toFixed(2)}ms`);

      // If not found, try historical slugs
      if (!projectId) {
        projectId = await findProjectIdByHistoricalSlug(projectSlug);

        // If found in history, redirect to current slug
        if (projectId) {
          const currentSlug = await getLatestProjectSlug(projectId);
          if (currentSlug && currentSlug !== projectSlug) {
            if (type === "project") {
              navigate(`/${currentSlug}`, { replace: true });
              return;
            } else if (type === "board" && boardName) {
              navigate(`/${currentSlug}/${boardName}`, { replace: true });
              return;
            }
          }
        }
      }

      if (!projectId) {
        // Project not found, redirect to home
        navigate("/", { replace: true });
        return;
      }

      // Track project access when we have both projectId and slug
      if (projectId && projectSlug) {
        // Note: useTrackProjectAccess hook will be called in child component
        // since hooks can't be called conditionally
      }

      let boardId: string | null = null;

      if (type === "board" && boardName) {
        performance.now();
        // Try to resolve current board name
        boardId = await resolveBoardName(projectId, boardName);

        // If not found, try historical names (but skip if we're about to create a new board)
        if (!boardId) {
          performance.now();
          boardId = await findBoardIdByHistoricalName(projectId, boardName);

          // If found in history, redirect to current name
          if (boardId) {
            const currentName = await getLatestBoardName(boardId);
            if (currentName && currentName !== boardName) {
              const currentProjectSlug = await getLatestProjectSlug(projectId);
              if (currentProjectSlug) {
                navigate(
                  `/${currentProjectSlug}/${encodeURIComponent(currentName)}`,
                  { replace: true }
                );
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
              return;
            }

            // Check if we're already creating this board to prevent duplicates
            if (creatingRef.current === creatingKey) {
              return;
            }

            try {
              const currentUser = auth.currentUser;
              if (currentUser) {
                creatingRef.current = creatingKey;
                hasAttemptedCreationRef.current.add(creatingKey);
                performance.now();
                boardId = await createBoardFromTitle(
                  projectId,
                  boardName,
                  currentUser.uid
                );

                // ボード作成後、作成されたボードの実際の名前を取得
                const actualBoardName = await getLatestBoardName(boardId);
                if (actualBoardName && actualBoardName !== boardName) {
                  // 作成されたボードの実際の名前が異なる場合、正しいURLにリダイレクト
                  const currentProjectSlug = await getLatestProjectSlug(
                    projectId
                  );
                  if (currentProjectSlug) {
                    navigate(
                      `/${currentProjectSlug}/${encodeURIComponent(
                        actualBoardName
                      )}`,
                      { replace: true }
                    );
                    return;
                  }
                }
              } else {
                // User not authenticated, redirect to project
                const currentProjectSlug = await getLatestProjectSlug(
                  projectId
                );
                if (currentProjectSlug) {
                  navigate(`/${currentProjectSlug}`, { replace: true });
                  return;
                }
              }
            } catch (error) {
              console.error("Error creating board:", error);
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
        // プロジェクト名の取得を非同期で実行（ブロックしない）
        const updateProject = async () => {
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
            console.error("Error updating current project:", error);
            updateCurrentProject(projectId);
          }
        };
        
        // プロジェクトIDだけ先に設定して、名前は後で取得
        updateCurrentProject(projectId);
        updateProject(); // 非同期で実行
      }

      setResolved({ projectId, boardId });
    } catch (error) {
      console.error("Error resolving slug:", error);
      navigate("/", { replace: true });
    } finally {
      setLoading(false);
    }
  }, []); // 依存関係を完全に削除して安定化

  // useEffectに戻すが、重複実行を防ぐ
  useEffect(() => {
    if (!resolved.projectId && !resolveRunning.current && projectSlug) {
      console.log("🔄 Starting resolve with useEffect (with duplicate prevention)");
      resolveRunning.current = true;
      resolveAndRedirect().finally(() => {
        resolveRunning.current = false;
      });
    }
  }, [projectSlug, boardName, type]); // プロジェクト固有の値のみ

  if (loading) {
    return (
      <SlugProvider
        projectId={resolved.projectId}
        boardId={resolved.boardId}
        loading={true}
      >
        {children}
      </SlugProvider>
    );
  }

  if (!resolved.projectId) {
    return null;
  }

  if (type === "board" && !resolved.boardId) {
    return null;
  }

  // Pass resolved IDs to children through Context
  return (
    <SlugProvider
      projectId={resolved.projectId}
      boardId={resolved.boardId}
      loading={false}
    >
      {children}
    </SlugProvider>
  );
}, (prevProps, nextProps) => {
  // メモ化の比較関数：propsが同じなら再レンダリングしない
  return prevProps.type === nextProps.type && 
         prevProps.children === nextProps.children;
});
