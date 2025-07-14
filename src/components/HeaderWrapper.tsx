import React, { ReactNode, useEffect, useState, memo } from "react";
import { useLocation, useParams } from "react-router-dom";
import { Header } from "./Header";
import { BoardTitle } from "./BoardTitle";
import { User } from "../types";
import { useProject } from "../contexts/ProjectContext";
import { rtdb } from "../config/firebase";
import { ref, get, set } from "firebase/database";

interface BackButton {
  path: string;
  label: string;
}

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
  const [projectName, setProjectName] = useState<string>("");
  const [boardName, setBoardName] = useState<string>("");
  const [foundProjectId, setFoundProjectId] = useState<string>("");
  const [isEditingBoardName, setIsEditingBoardName] = useState<boolean>(false);
  const [editingBoardName, setEditingBoardName] = useState<string>("");

  // Auth page excludes header
  if (path.includes("/invite/") && !user) {
    return null;
  }

  // Get project name and board name for all pages
  useEffect(() => {
    const getPageData = async () => {
      let foundProjectId = params.projectId || currentProjectId;
      
      // Reset states
      setProjectName("");
      setBoardName("");
      setFoundProjectId("");

      // For board pages, get both board and project data
      const boardPageMatch = path.match(/^\/([^\/]+)$/);
      if (boardPageMatch && 
          !path.includes("/user/") && 
          !path.includes("/create-") && 
          !path.includes("/invite/")) {
        const boardId = boardPageMatch[1];
        try {
          const boardRef = ref(rtdb, `boards/${boardId}`);
          const boardSnapshot = await get(boardRef);
          if (boardSnapshot.exists()) {
            const boardData = boardSnapshot.val();
            setBoardName(boardData.name);
            setEditingBoardName(boardData.name);
            foundProjectId = boardData.projectId;
          }
        } catch (error) {
          console.error("Error fetching board data:", error);
        }
      }

      // Get project name if we have a project ID
      if (foundProjectId) {
        try {
          const projectRef = ref(rtdb, `projects/${foundProjectId}`);
          const projectSnapshot = await get(projectRef);
          if (projectSnapshot.exists()) {
            setProjectName(projectSnapshot.val().name);
            setFoundProjectId(foundProjectId);
          }
        } catch (error) {
          console.error("Error fetching project data:", error);
        }
      }
    };

    getPageData();
  }, [params.projectId, currentProjectId, path]);

  // Board name editing functions
  const handleBoardNameEdit = () => {
    setIsEditingBoardName(true);
  };

  const handleBoardNameChange = (name: string) => {
    setEditingBoardName(name);
  };

  const handleBoardNameSave = async () => {
    // If empty, revert to original name
    if (!editingBoardName.trim()) {
      setEditingBoardName(boardName);
      setIsEditingBoardName(false);
      return;
    }

    if (editingBoardName.trim() !== boardName) {
      const boardPageMatch = path.match(/^\/([^\/]+)$/);
      if (boardPageMatch) {
        const boardId = boardPageMatch[1];
        try {
          const boardRef = ref(rtdb, `boards/${boardId}/name`);
          await set(boardRef, editingBoardName.trim());
          setBoardName(editingBoardName.trim());
        } catch (error) {
          console.error("Error updating board name:", error);
          setEditingBoardName(boardName);
        }
      }
    }
    setIsEditingBoardName(false);
  };

  // Define page-specific header configuration
  const getHeaderConfig = () => {
    // For board pages, show project name as title and board name as subtitle
    const boardPageMatch = path.match(/^\/([^\/]+)$/);
    if (boardPageMatch && 
        !path.includes("/user/") && 
        !path.includes("/create-") && 
        !path.includes("/invite/")) {
      return { 
        title: projectName || "", 
        subtitle: boardName || "",
        titleLink: foundProjectId ? `/project/${foundProjectId}` : "/",
        onSubtitleClick: handleBoardNameEdit,
        isEditingSubtitle: isEditingBoardName,
        editingSubtitle: editingBoardName,
        onSubtitleChange: handleBoardNameChange,
        onSubtitleSave: handleBoardNameSave
      };
    }
    
    // For other pages, just show project name
    return { title: projectName || "" };
  };

  const config = getHeaderConfig();

  return <Header user={user} {...config} />;
});
