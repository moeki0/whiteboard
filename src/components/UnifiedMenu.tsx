import { useState, useEffect, useRef, memo, useMemo, useCallback } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { auth, rtdb } from "../config/firebase";
import { ref, onValue, get } from "firebase/database";
import { User, Project } from "../types";
import { useProject } from "../contexts/ProjectContext";
import "./UnifiedMenu.css";
import { signOut } from "firebase/auth";

interface UnifiedMenuProps {
  user: User;
}

export const UnifiedMenu = memo(function UnifiedMenu({
  user,
}: UnifiedMenuProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { currentProjectId } = useProject();
  const [isOpen, setIsOpen] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [canEditBoard, setCanEditBoard] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Check if we're on a board page - memoized to avoid recalculation
  const { currentBoardId, isOnBoardPage } = useMemo(() => {
    const boardId = location.pathname.match(/^\/([^/]+)$/)?.[1];
    const onBoardPage =
      boardId &&
      !location.pathname.includes("/project/") &&
      !location.pathname.includes("/user/") &&
      !location.pathname.includes("/create-") &&
      !location.pathname.includes("/invite/") &&
      !location.pathname.includes("/board/");

    return { currentBoardId: boardId, isOnBoardPage: onBoardPage };
  }, [location.pathname]);

  useEffect(() => {
    // Listen to user's projects
    const userProjectsRef = ref(rtdb, `userProjects/${user.uid}`);
    const unsubscribe = onValue(userProjectsRef, async (snapshot) => {
      const userProjectData = snapshot.val();
      if (userProjectData) {
        const projectIds = Object.keys(userProjectData);
        const projectPromises = projectIds.map(async (projectId) => {
          try {
            const projectRef = ref(rtdb, `projects/${projectId}`);
            const projectSnapshot = await get(projectRef);
            if (projectSnapshot.exists()) {
              return { id: projectId, ...projectSnapshot.val() };
            } else {
              return null;
            }
          } catch (error) {
            console.error(`Error fetching project ${projectId}:`, error);
            return null;
          }
        });

        const projectResults = await Promise.all(projectPromises);
        const validProjects = projectResults.filter((p) => p !== null);
        setProjects(validProjects);
      } else {
        setProjects([]);
      }
    });

    return () => unsubscribe();
  }, [user.uid]);

  // Check board permissions when on a board page
  useEffect(() => {
    if (!isOnBoardPage || !currentBoardId) {
      setCanEditBoard(false);
      return;
    }

    const checkBoardPermissions = async () => {
      try {
        const boardRef = ref(rtdb, `boards/${currentBoardId}`);
        const boardSnapshot = await get(boardRef);

        if (boardSnapshot.exists()) {
          const boardData = boardSnapshot.val();

          if (boardData.projectId) {
            const projectRef = ref(rtdb, `projects/${boardData.projectId}`);
            const projectSnapshot = await get(projectRef);

            if (projectSnapshot.exists()) {
              const projectData = projectSnapshot.val();
              const userMember = projectData.members?.[user.uid];
              setCanEditBoard(!!userMember);
            } else {
              setCanEditBoard(false);
            }
          } else {
            // Board has no project association, check if user created it
            setCanEditBoard(boardData.createdBy === user.uid);
          }
        } else {
          setCanEditBoard(false);
        }
      } catch (error) {
        console.error("Error checking board permissions:", error);
        setCanEditBoard(false);
      }
    };

    checkBoardPermissions();
  }, [isOnBoardPage, currentBoardId, user.uid]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const handleProjectSelect = useCallback(
    (projectId: string) => {
      setIsOpen(false);
      navigate(`/project/${projectId}`);
    },
    [navigate]
  );

  const handleProjectSettings = useCallback(() => {
    setIsOpen(false);
    if (currentProjectId) {
      navigate(`/project/${currentProjectId}/settings`);
    }
  }, [navigate, currentProjectId]);

  const handleCreateProject = useCallback(() => {
    setIsOpen(false);
    navigate("/create-project");
  }, [navigate]);

  const handleUserSettings = useCallback(() => {
    setIsOpen(false);
    navigate("/user/settings");
  }, [navigate]);

  const handleBoardSettings = useCallback(() => {
    setIsOpen(false);
    if (currentBoardId) {
      navigate(`/board/${currentBoardId}/settings`);
    }
  }, [navigate, currentBoardId]);

  const toggleMenu = useCallback(() => {
    setIsOpen((prev) => !prev);
  }, []);

  const handleLogout = async () => {
    if (!window.confirm("Are you sure you want to logout?")) {
      return;
    }

    await signOut(auth);
  };

  return (
    <div className="unified-menu" ref={dropdownRef}>
      <button
        className="menu-trigger"
        onClick={toggleMenu}
        title={user.displayName || user.email || undefined}
      >
        {user.photoURL ? (
          <img
            src={user.photoURL}
            alt="Profile"
            referrerPolicy="no-referrer"
            className="user-avatar"
          />
        ) : (
          <div className="user-avatar">
            {(user.displayName || user.email || "U").charAt(0).toUpperCase()}
          </div>
        )}
      </button>

      {isOpen && (
        <div className="unified-dropdown">
          {/* User Section */}
          <button className="menu-item" onClick={handleUserSettings}>
            User Settings
          </button>

          {isOnBoardPage && canEditBoard && (
            <>
              <button className="menu-item" onClick={handleBoardSettings}>
                Board Settings
              </button>
            </>
          )}

          {/* Project Section */}
          <div className="menu-section project-section">
            {currentProjectId && (
              <button className="menu-item" onClick={handleProjectSettings}>
                Project Settings
              </button>
            )}

            {projects.length > 0 && <div className="menu-divider" />}

            {projects.map((project) => (
              <button
                key={project.id}
                className={`menu-item ${
                  project.id === currentProjectId ? "active" : ""
                }`}
                onClick={() => handleProjectSelect(project.id)}
              >
                <span className="project-name">{project.name}</span>
              </button>
            ))}

            <button className="menu-item" onClick={handleCreateProject}>
              Create New Project
              <span className="menu-icon">+</span>
            </button>

            {projects.length === 0 && (
              <div className="menu-item disabled">No projects found</div>
            )}

            {projects.length > 0 && <div className="menu-divider" />}

            <button className={`menu-item`} onClick={() => handleLogout()}>
              <span className="project-name">Log out</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
});
