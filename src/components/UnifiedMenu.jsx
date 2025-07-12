import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { rtdb } from "../config/firebase";
import { ref, onValue } from "firebase/database";
import "./UnifiedMenu.css";

export function UnifiedMenu({ user, currentProjectId }) {
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const [projects, setProjects] = useState([]);
  const dropdownRef = useRef(null);

  useEffect(() => {
    // Listen to user's projects
    const userProjectsRef = ref(rtdb, `userProjects/${user.uid}`);
    const unsubscribe = onValue(userProjectsRef, async (snapshot) => {
      const userProjectData = snapshot.val();
      if (userProjectData) {
        const projectIds = Object.keys(userProjectData);
        const projectPromises = projectIds.map(async (projectId) => {
          const projectRef = ref(rtdb, `projects/${projectId}`);
          return new Promise((resolve) => {
            onValue(
              projectRef,
              (projectSnapshot) => {
                const project = projectSnapshot.val();
                if (project) {
                  resolve({ id: projectId, ...project });
                } else {
                  resolve(null);
                }
              },
              { onlyOnce: true }
            );
          });
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

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const handleProjectSelect = (projectId) => {
    setIsOpen(false);
    navigate(`/project/${projectId}`);
  };

  const handleProjectSettings = () => {
    setIsOpen(false);
    if (currentProjectId) {
      navigate(`/project/${currentProjectId}/settings`);
    }
  };

  const handleCreateProject = () => {
    setIsOpen(false);
    navigate("/create-project");
  };

  const handleUserSettings = () => {
    setIsOpen(false);
    navigate("/user/settings");
  };

  return (
    <div className="unified-menu" ref={dropdownRef}>
      <button
        className="menu-trigger"
        onClick={() => setIsOpen(!isOpen)}
        title={user.displayName || user.email}
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
          </div>
        </div>
      )}
    </div>
  );
}
