import { useEffect, useState, memo } from "react";
import { useLocation, useParams, useNavigate } from "react-router-dom";
import { Header } from "./Header";
import { User } from "../types";
import { useProject } from "../contexts/ProjectContext";
import { useSlug } from "../contexts/SlugContext";
import { rtdb } from "../config/firebase";
import { ref, get, set, onValue, off } from "firebase/database";
import {
  checkBoardNameDuplicate,
  generateUniqueBoardName,
} from "../utils/boardNaming";
import {
  getLatestProjectSlug,
  recordBoardNameChange,
} from "../utils/historyManager";
import { checkBoardEditPermission } from "../utils/permissions";
import { updateBoardSortScore } from "../utils/boardSortScore";

interface HeaderWrapperProps {
  user: User;
}

export const HeaderWrapper = memo(function HeaderWrapper({
  user,
}: HeaderWrapperProps) {
  const location = useLocation();
  const params = useParams();
  const navigate = useNavigate();
  const path = location.pathname;
  const { currentProjectId, currentProjectName } = useProject();
  const { resolvedProjectId, resolvedBoardId } = useSlug();
  // Use project name from context instead of local state to prevent flickering
  const [foundProjectId, setFoundProjectId] = useState<string>("");
  const [projectSlug, setProjectSlug] = useState<string>("");
  const [boardTitle, setBoardTitle] = useState<string>("");
  const [boardId, setBoardId] = useState<string>("");
  const [isEditingBoardTitle, setIsEditingBoardTitle] = useState<boolean>(false);
  const [editingBoardTitle, setEditingBoardTitle] = useState<string>("");
  const [isDuplicateName, setIsDuplicateName] = useState<boolean>(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [duplicateCheckTimeout, setDuplicateCheckTimeout] = useState<any>(null);

  useEffect(() => {
    const getPageData = async () => {
      let foundProjectId = currentProjectId;
      let currentBoardId = "";

      // No need to reset project name - it's managed by ProjectContext
      setFoundProjectId("");
      setProjectSlug("");
      setBoardTitle("");
      setBoardId("");

      // Check if we have resolved IDs from SlugContext (for slug-based routes)
      if (resolvedProjectId && resolvedBoardId) {
        foundProjectId = resolvedProjectId;
        currentBoardId = resolvedBoardId;
        setBoardId(resolvedBoardId);
      } else {
        // For legacy board pages (/:boardId format)
        const boardPageMatch = path.match(/^\/([^/]+)$/);
        if (
          boardPageMatch &&
          !path.includes("/user/") &&
          !path.includes("/create-") &&
          !path.includes("/invite/")
        ) {
          currentBoardId = boardPageMatch[1];
          setBoardId(currentBoardId);

          try {
            const boardRef = ref(rtdb, `boards/${currentBoardId}`);
            const boardSnapshot = await get(boardRef);
            if (boardSnapshot.exists()) {
              const boardData = boardSnapshot.val();
              foundProjectId = boardData.projectId;
            }
          } catch (error) {
            console.error("Error fetching board data:", error);
          }
        }
      }

      // Get project name and slug if we have a project ID
      if (foundProjectId) {
        try {
          const projectRef = ref(rtdb, `projects/${foundProjectId}`);
          const projectSnapshot = await get(projectRef);
          if (projectSnapshot.exists()) {
            const projectData = projectSnapshot.val();
            // Project name is managed by ProjectContext - no need to update local state
            setProjectSlug(projectData.slug || "");
            setFoundProjectId(foundProjectId);
          }
        } catch (error) {
          console.error("Error fetching project data:", error);
          // Try to get slug from historyManager as fallback
          try {
            const slug = await getLatestProjectSlug(foundProjectId);
            if (slug) {
              setProjectSlug(slug);
            }
          } catch (slugError) {
            console.error("Error fetching project slug:", slugError);
          }
        }
      }

      // Set up real-time listener for board title
      if (currentBoardId) {
        const boardRef = ref(rtdb, `boards/${currentBoardId}`);
        const unsubscribe = onValue(boardRef, (snapshot) => {
          if (snapshot.exists()) {
            const boardData = snapshot.val();
            const newTitle = boardData.name || "";
            
            setBoardTitle(newTitle);
            // Only update if not currently editing to avoid conflicts
            if (!isEditingBoardTitle) {
              setEditingBoardTitle(newTitle);
            }
          }
        });

        // Return cleanup function
        return unsubscribe;
      }
    };

    const cleanup = getPageData();
    
    // Cleanup function
    return () => {
      if (cleanup && typeof cleanup === 'function') {
        cleanup();
      }
    };
  }, [
    params.projectId,
    currentProjectId,
    path,
    resolvedProjectId,
    resolvedBoardId,
    isEditingBoardTitle, // Add to dependencies to update listener when edit state changes
  ]);

  // リアルタイムで重複チェック
  const checkDuplicateRealtime = async (newTitle: string) => {
    if (!boardId || !foundProjectId || newTitle.trim() === boardTitle) {
      setIsDuplicateName(false);
      return;
    }

    const isDuplicate = await checkBoardNameDuplicate(
      foundProjectId,
      newTitle.trim(),
      boardId
    );

    setIsDuplicateName(isDuplicate);
  };

  const handleBoardTitleClick = () => {
    if (boardId) {
      setIsEditingBoardTitle(true);
      setEditingBoardTitle(boardTitle);
      setIsDuplicateName(false);
    }
  };

  const handleBoardTitleChange = (value: string) => {
    setEditingBoardTitle(value);

    // 既存のタイマーをクリア
    if (duplicateCheckTimeout) {
      clearTimeout(duplicateCheckTimeout);
    }

    // 500ms後に重複チェック実行
    const timeout = setTimeout(() => {
      checkDuplicateRealtime(value);
    }, 500);

    setDuplicateCheckTimeout(timeout);
  };

  const handleBoardTitleSave = () => {
    // タイマーをクリア
    if (duplicateCheckTimeout) {
      clearTimeout(duplicateCheckTimeout);
      setDuplicateCheckTimeout(null);
    }

    if (boardId && editingBoardTitle.trim()) {
      // 即座にUI状態を更新してユーザーフィードバックを提供
      setIsEditingBoardTitle(false);
      setIsDuplicateName(false);

      // 非同期でデータベース更新を実行
      const updateBoardTitle = async () => {
        try {
          const boardRef = ref(rtdb, `boards/${boardId}`);
          const boardData = (await get(boardRef)).val() || {};

          // プロジェクトデータを取得して権限チェック
          let project = null;
          if (boardData.projectId) {
            const projectRef = ref(rtdb, `projects/${boardData.projectId}`);
            const projectSnapshot = await get(projectRef);
            project = projectSnapshot.exists() ? projectSnapshot.val() : null;
          }

          // ボード編集権限をチェック
          const permissionCheck = checkBoardEditPermission(boardData, project, user.uid);
          if (!permissionCheck.canEdit) {
            console.error('User does not have permission to edit this board:', permissionCheck.reason);
            setEditingBoardTitle(boardTitle);
            setBoardTitle(boardTitle);
            return;
          }

          // 同じプロジェクト内で重複チェック
          if (boardData.projectId) {
            const isDuplicate = await checkBoardNameDuplicate(
              boardData.projectId,
              editingBoardTitle.trim(),
              boardId
            );

            let finalName = editingBoardTitle.trim();

            if (isDuplicate) {
              // 重複する場合、一意な名前を生成
              finalName = await generateUniqueBoardName(
                boardData.projectId,
                editingBoardTitle.trim(),
                boardId
              );
            }

            // 並列でデータベース更新を実行
            const now = Date.now();
            await Promise.all([
              set(boardRef, {
                ...boardData,
                name: finalName,
                updatedAt: now,
              }),
              set(ref(rtdb, `projectBoards/${boardData.projectId}/${boardId}`), {
                ...boardData,
                name: finalName,
                updatedAt: now,
              }),
              // sortScoreも更新
              updateBoardSortScore(boardData.projectId, boardId, boardData.isPinned || false, now, boardData.pinnedAt),
            ]);

            // バックグラウンドでメタデータ更新
            Promise.all([
              boardTitle !== finalName ? recordBoardNameChange(boardId, boardTitle, finalName) : Promise.resolve(),
              import("../utils/boardMetadata").then(({ updateBoardTitle }) => updateBoardTitle(boardId, finalName)),
            ]).catch(error => console.error("Error updating metadata:", error));

            setBoardTitle(finalName);
            setEditingBoardTitle(finalName);

            // Update URL if this is a slug-based route
            if (projectSlug && boardTitle !== finalName) {
              const newUrl = `/${projectSlug}/${encodeURIComponent(finalName)}`;
              navigate(newUrl, { replace: true });
            }
          } else {
            // プロジェクトIDがない場合はそのまま保存
            await set(boardRef, {
              ...boardData,
              name: editingBoardTitle.trim(),
            });

            // バックグラウンドでメタデータ更新
            Promise.all([
              boardTitle !== editingBoardTitle.trim() ? recordBoardNameChange(boardId, boardTitle, editingBoardTitle.trim()) : Promise.resolve(),
              import("../utils/boardMetadata").then(({ updateBoardTitle }) => updateBoardTitle(boardId, editingBoardTitle.trim())),
            ]).catch(error => console.error("Error updating metadata:", error));

            setBoardTitle(editingBoardTitle.trim());

            // Update URL if this is a slug-based route (for cases without projectId)
            if (projectSlug && boardTitle !== editingBoardTitle.trim()) {
              const newUrl = `/${projectSlug}/${encodeURIComponent(editingBoardTitle.trim())}`;
              navigate(newUrl, { replace: true });
            }
          }
        } catch (error) {
          console.error("Error updating board title:", error);
          // エラーが発生した場合、元の状態に戻す
          setEditingBoardTitle(boardTitle);
          setBoardTitle(boardTitle);
        }
      };

      // 非同期実行（UIをブロックしない）
      updateBoardTitle();
    } else {
      setIsEditingBoardTitle(false);
      setIsDuplicateName(false);
    }
  };

  const handleBoardTitleCancel = () => {
    setIsEditingBoardTitle(false);
    setEditingBoardTitle(boardTitle);
    setIsDuplicateName(false);
    
    // タイマーをクリア
    if (duplicateCheckTimeout) {
      clearTimeout(duplicateCheckTimeout);
      setDuplicateCheckTimeout(null);
    }
  };

  // Define page-specific header configuration
  const getHeaderConfig = () => {
    // Show search when we have a project ID (in project context)
    const showSearch = Boolean(foundProjectId);
    
    return {
      title: currentProjectName || "", // Use project name from context
      titleLink: projectSlug ? `/${projectSlug}` : `/project/${foundProjectId}`,
      subtitle: boardTitle,
      onSubtitleClick: handleBoardTitleClick,
      isEditingSubtitle: isEditingBoardTitle,
      editingSubtitle: editingBoardTitle,
      onSubtitleChange: handleBoardTitleChange,
      onSubtitleSave: handleBoardTitleSave,
      onSubtitleCancel: handleBoardTitleCancel,
      isDuplicateName: isDuplicateName,
      showSearch: showSearch,
    };
  };

  const config = getHeaderConfig();

  if (path.includes("/invite/") && !user) {
    return null;
  }

  return <Header user={user} {...config} />;
});
