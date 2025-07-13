import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { rtdb } from "../config/firebase";
import { ref, onValue, set } from "firebase/database";
import { customAlphabet } from "nanoid";
import { useProject } from "../contexts/ProjectContext";
import { Header } from "./Header";
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

    updateCurrentProject(projectId);
  };

  useEffect(() => {
    // Listen to user's projects
    const userProjectsRef = ref(rtdb, `userProjects/${user.uid}`);
    const unsubscribe = onValue(userProjectsRef, async (snapshot) => {
      const userProjectData = snapshot.val();
      console.log("User projects data:", userProjectData);

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
        console.log("Valid projects:", validProjects);
        console.log("Current project ID:", currentProjectId);

        setProjects(validProjects as (Project & { id: string })[]);

        // If user has no current project but has projects, set the first one
        if (!currentProjectId && validProjects.length > 0) {
          const firstProject = validProjects[0] as Project & { id: string };
          console.log("Setting first project as current:", firstProject.id);
          updateCurrentProject(firstProject.id);
        }
        // If current project doesn't exist, clear it
        else if (
          currentProjectId &&
          !validProjects.find((p) => (p as any).id === currentProjectId)
        ) {
          console.log("Current project not found, clearing");
          updateCurrentProject(null);
        }
      } else {
        console.log("No user projects found");
        setProjects([]);
        updateCurrentProject(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, [user.uid, updateCurrentProject]);

  console.log("Home component state:", { loading, projects, currentProjectId });

  if (loading) {
    return <div className="loading"></div>;
  }

  // If user has no projects, show welcome screen
  if (projects.length === 0) {
    return (
      <div className="welcome-screen">
        <Header title="Welcome to Maplap" user={user} />
        <div className="welcome-content">
          <div className="welcome-card">
            <h2>Welcome to Maplap!</h2>
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

  // If user has a current project, show its boards
  if (currentProjectId) {
    console.log("Rendering BoardList with projectId:", currentProjectId);
    return <BoardList user={user} projectId={currentProjectId} />;
  }

  // Fallback - should not happen
  return <div className="loading"></div>;
}
