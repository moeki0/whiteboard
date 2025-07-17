import { useEffect, useState, memo } from "react";
import { useLocation, useParams } from "react-router-dom";
import { Header } from "./Header";
import { User } from "../types";
import { useProject } from "../contexts/ProjectContext";
import { rtdb } from "../config/firebase";
import { ref, get } from "firebase/database";

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
  const [foundProjectId, setFoundProjectId] = useState<string>("");

  useEffect(() => {
    const getPageData = async () => {
      let foundProjectId = currentProjectId;

      // Reset states
      setProjectName("");
      setFoundProjectId("");

      // For board pages, get project data via board
      const boardPageMatch = path.match(/^\/([^/]+)$/);
      if (
        boardPageMatch &&
        !path.includes("/user/") &&
        !path.includes("/create-") &&
        !path.includes("/invite/")
      ) {
        const boardId = boardPageMatch[1];
        try {
          const boardRef = ref(rtdb, `boards/${boardId}`);
          const boardSnapshot = await get(boardRef);
          if (boardSnapshot.exists()) {
            const boardData = boardSnapshot.val();
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

  // Define page-specific header configuration
  const getHeaderConfig = () => {
    return {
      title: projectName,
      titleLink: `/project/${foundProjectId}`,
    };
  };

  const config = getHeaderConfig();

  if (path.includes("/invite/") && !user) {
    return null;
  }

  return <Header user={user} {...config} />;
});
