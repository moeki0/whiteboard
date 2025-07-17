import { useEffect, useState, memo } from "react";
import { useLocation, useParams } from "react-router-dom";
import { Header } from "./Header";
import { User } from "../types";
import { useProject } from "../contexts/ProjectContext";
import { useSlug } from "../contexts/SlugContext";
import { rtdb } from "../config/firebase";
import { ref, get, set } from "firebase/database";
import { checkBoardNameDuplicate, generateUniqueBoardName } from "../utils/boardNaming";
import { getLatestProjectSlug, recordBoardNameChange } from "../utils/historyManager";

interface HeaderWrapperProps {
  user: User;
}

export const HeaderWrapper = memo(function HeaderWrapper({
  user,
}: HeaderWrapperProps) {
  const location = useLocation();
  const params = useParams();
  const path = location.pathname;
  const { currentProjectId } = useProject();
  const { resolvedProjectId, resolvedBoardId } = useSlug();
  const [projectName, setProjectName] = useState<string>("");
  const [foundProjectId, setFoundProjectId] = useState<string>("");
  const [projectSlug, setProjectSlug] = useState<string>("");
  const [boardTitle, setBoardTitle] = useState<string>("");
  const [boardId, setBoardId] = useState<string>("");
  const [isEditingBoardTitle, setIsEditingBoardTitle] = useState<boolean>(false);
  const [editingBoardTitle, setEditingBoardTitle] = useState<string>("");
  const [isDuplicateName, setIsDuplicateName] = useState<boolean>(false);
  const [duplicateCheckTimeout, setDuplicateCheckTimeout] = useState<number | null>(null);

  useEffect(() => {
    const getPageData = async () => {
      let foundProjectId = currentProjectId;

      // Reset states
      setProjectName("");
      setFoundProjectId("");
      setProjectSlug("");
      setBoardTitle("");
      setBoardId("");

      // Check if we have resolved IDs from SlugContext (for slug-based routes)
      if (resolvedProjectId && resolvedBoardId) {
        foundProjectId = resolvedProjectId;
        setBoardId(resolvedBoardId);
        
        try {
          const boardRef = ref(rtdb, `boards/${resolvedBoardId}`);
          const boardSnapshot = await get(boardRef);
          if (boardSnapshot.exists()) {
            const boardData = boardSnapshot.val();
            setBoardTitle(boardData.name || "");
          }
        } catch (error) {
          console.error("Error fetching board data:", error);
        }
      } else {
        // For legacy board pages (/:boardId format)
        const boardPageMatch = path.match(/^\/([^/]+)$/);
        if (
          boardPageMatch &&
          !path.includes("/user/") &&
          !path.includes("/create-") &&
          !path.includes("/invite/")
        ) {
          const currentBoardId = boardPageMatch[1];
          setBoardId(currentBoardId);
          
          try {
            const boardRef = ref(rtdb, `boards/${currentBoardId}`);
            const boardSnapshot = await get(boardRef);
            if (boardSnapshot.exists()) {
              const boardData = boardSnapshot.val();
              foundProjectId = boardData.projectId;
              
              // Get board title from board data
              setBoardTitle(boardData.name || "");
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
            setProjectName(projectData.name);
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
    };

    getPageData();
  }, [params.projectId, currentProjectId, path, resolvedProjectId, resolvedBoardId]);

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

  const handleBoardTitleSave = async () => {
    // タイマーをクリア
    if (duplicateCheckTimeout) {
      clearTimeout(duplicateCheckTimeout);
      setDuplicateCheckTimeout(null);
    }
    
    if (boardId && editingBoardTitle.trim()) {
      try {
        const boardRef = ref(rtdb, `boards/${boardId}`);
        const boardData = (await get(boardRef)).val() || {};
        
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
          
          await set(boardRef, {
            ...boardData,
            name: finalName,
          });
          
          // プロジェクトボードの参照も更新
          const projectBoardRef = ref(rtdb, `projectBoards/${boardData.projectId}/${boardId}`);
          await set(projectBoardRef, {
            ...boardData,
            name: finalName,
          });
          
          // Record the name change in history
          if (boardTitle !== finalName) {
            await recordBoardNameChange(boardId, boardTitle, finalName);
          }
          
          setBoardTitle(finalName);
          setEditingBoardTitle(finalName);
        } else {
          // プロジェクトIDがない場合はそのまま保存
          await set(boardRef, {
            ...boardData,
            name: editingBoardTitle.trim(),
          });
          
          // Record the name change in history
          if (boardTitle !== editingBoardTitle.trim()) {
            await recordBoardNameChange(boardId, boardTitle, editingBoardTitle.trim());
          }
          
          setBoardTitle(editingBoardTitle.trim());
        }
        
        setIsEditingBoardTitle(false);
        setIsDuplicateName(false);
      } catch (error) {
        console.error("Error updating board title:", error);
      }
    } else {
      setIsEditingBoardTitle(false);
      setIsDuplicateName(false);
    }
  };

  // Define page-specific header configuration
  const getHeaderConfig = () => {
    return {
      title: projectName,
      titleLink: projectSlug ? `/${projectSlug}` : `/project/${foundProjectId}`,
      subtitle: boardTitle,
      onSubtitleClick: handleBoardTitleClick,
      isEditingSubtitle: isEditingBoardTitle,
      editingSubtitle: editingBoardTitle,
      onSubtitleChange: handleBoardTitleChange,
      onSubtitleSave: handleBoardTitleSave,
      isDuplicateName: isDuplicateName,
    };
  };

  const config = getHeaderConfig();

  if (path.includes("/invite/") && !user) {
    return null;
  }

  return <Header user={user} {...config} />;
});
