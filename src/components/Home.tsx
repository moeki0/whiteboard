import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { rtdb } from "../config/firebase";
import { ref, onValue, set, get } from "firebase/database";
import { customAlphabet } from "nanoid";
import { useProject } from "../contexts/ProjectContext";
import { BoardList } from "./BoardList";
import { User, Project } from "../types";

interface HomeProps {
  user: User;
}

export function Home({ user }: HomeProps) {
  const navigate = useNavigate();
  const { currentProjectId, updateCurrentProject } = useProject();
  const [projects, setProjects] = useState<(Project & { id: string })[]>([]);
  const [loading, setLoading] = useState(true);
  const nanoid = customAlphabet(
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789",
    21
  );

  const createFirstProject = async () => {
    const projectId = nanoid();
    const inviteCode = customAlphabet(
      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789",
      12
    )();
    const project = {
      name: "My First Project",
      createdBy: user.uid,
      createdAt: Date.now(),
      inviteCode: inviteCode,
      isPublic: false, // Default to private
      members: {
        [user.uid]: {
          email: user.email,
          displayName: user.displayName || user.email,
          role: "owner",
          joinedAt: Date.now(),
        },
      },
    };

    // Create the project
    const projectRef = ref(rtdb, `projects/${projectId}`);
    await set(projectRef, project);

    // Add project to user's project list
    const userProjectRef = ref(rtdb, `userProjects/${user.uid}/${projectId}`);
    await set(userProjectRef, { role: "owner", joinedAt: Date.now() });

    // Create invite link mapping
    const inviteRef = ref(rtdb, `invites/${inviteCode}`);
    await set(inviteRef, { projectId: projectId, createdAt: Date.now() });

    updateCurrentProject(projectId, project.name);
  };

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
              const project = projectSnapshot.val();
              return { id: projectId, ...project };
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

        setProjects(validProjects as (Project & { id: string })[]);

        // If user has no current project but has projects, set the first one
        if (!currentProjectId && validProjects.length > 0) {
          const firstProject = validProjects[0] as Project & { id: string };
          updateCurrentProject(firstProject.id);
        }
        // If current project doesn't exist, clear it
        else if (
          currentProjectId &&
          !validProjects.find((p) => (p as any).id === currentProjectId)
        ) {
          updateCurrentProject(null);
        }
      } else {
        setProjects([]);
        updateCurrentProject(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, [user.uid, updateCurrentProject, currentProjectId]);
  
  if (loading) {
    return <div className="loading"></div>;
  }

  // If user has no projects, show welcome screen
  if (projects.length === 0) {
    return (
      <div className="welcome-screen">
        <div className="welcome-content">
          <div className="welcome-card">
            <h2>Welcome to Whiteboard!</h2>
            <p>
              You don't have any projects yet. Let's create your first project
              to get started.
            </p>
            <button
              onClick={createFirstProject}
              className="create-first-project-btn"
            >
              Create Your First Project
            </button>
          </div>
        </div>
      </div>
    );
  }

  // If user has a current project, redirect to project page
  if (currentProjectId) {
    navigate(`/project/${currentProjectId}`, { replace: true });
    return <div className="loading">Redirecting...</div>;
  }

  // If user has projects but no current project, redirect to first project
  if (projects.length > 0) {
    const firstProject = projects[0];
    updateCurrentProject(firstProject.id);
    navigate(`/project/${firstProject.id}`);
    return <div className="loading">Redirecting...</div>;
  }

  // Fallback - should not happen
  return <div className="loading"></div>;
}
