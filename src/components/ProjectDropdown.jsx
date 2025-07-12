import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { rtdb } from "../config/firebase";
import { ref, onValue } from "firebase/database";
import "./ProjectDropdown.css";
import { LuMenu } from "react-icons/lu";

export function ProjectDropdown({ user, currentProjectId }) {
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

  return (
    <div className="project-dropdown" ref={dropdownRef}>
      <button
        className="project-menu-btn"
        onClick={() => setIsOpen(!isOpen)}
        aria-label="Project menu"
      >
        <span className="menu-icon">
          <LuMenu />
        </span>
      </button>

      {isOpen && (
        <div className="dropdown-menu">
          {currentProjectId && (
            <button className="dropdown-item" onClick={handleProjectSettings}>
              Project settings
            </button>
          )}

          <div className="dropdown-divider" />

          {projects.map((project) => (
            <button
              key={project.id}
              className={`dropdown-item ${
                project.id === currentProjectId ? "active" : ""
              }`}
              onClick={() => handleProjectSelect(project.id)}
            >
              <span className="project-name">{project.name}</span>
            </button>
          ))}

          <button className="dropdown-item" onClick={handleCreateProject}>
            <span className="project-icon">+</span>
            Create New Project
          </button>

          {projects.length === 0 && (
            <div className="dropdown-item disabled">No projects found</div>
          )}
        </div>
      )}
    </div>
  );
}
