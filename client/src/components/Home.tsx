import { useState, useEffect } from "react";
import { rtdb } from "../config/firebase";
import { ref, onValue, set, get } from "firebase/database";
import { customAlphabet } from "nanoid";
import { useProject } from "../contexts/ProjectContext";
import { getBoardInfo } from "../utils/boardInfo";
import { User, Project } from "../types";
import { useRecentProject } from "../hooks/useRecentProject";
import { useNavigate } from "react-router-dom";

interface HomeProps {
  user: User;
}

export function Home({ user }: HomeProps) {
  const { currentProjectId, updateCurrentProject } = useProject();
  const [projects, setProjects] = useState<(Project & { id: string })[]>([]);
  const [loading, setLoading] = useState(true);
  const [checkingRecent, setCheckingRecent] = useState(true);
  const { getRecentProject } = useRecentProject();
  const navigate = useNavigate();
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

  // Check for recent project and redirect
  useEffect(() => {
    const checkRecentProject = async () => {
      try {
        const recent = getRecentProject();

        if (recent.id && recent.slug) {
          // Verify project still exists and user has access
          const [projectSnapshot, userProjectSnapshot] = await Promise.all([
            get(ref(rtdb, `projects/${recent.id}`)),
            get(ref(rtdb, `userProjects/${user.uid}/${recent.id}`)),
          ]);

          if (projectSnapshot.exists() && userProjectSnapshot.exists()) {
            navigate(`/${recent.slug}`, { replace: true });
            return;
          } else {
            // Clear invalid recent project
            localStorage.removeItem("recentProjectId");
            localStorage.removeItem("recentProjectSlug");
          }
        }
      } catch (error) {
        console.error("Error checking recent project:", error);
      } finally {
        setCheckingRecent(false);
      }
    };

    // Add delay to ensure Firebase is ready
    const timer = setTimeout(checkRecentProject, 100);
    return () => clearTimeout(timer);
  }, [user.uid, navigate]);

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

        // Check if we should redirect to recent project first
        const recent = getRecentProject();
        if (
          recent.id &&
          recent.slug &&
          validProjects.some((p) => p.id === recent.id)
        ) {
          navigate(`/${recent.slug}`, { replace: true });
          return;
        }

        // If user has no current project but has projects, set the first one
        if (!currentProjectId && validProjects.length > 0) {
          const firstProject = validProjects[0] as Project & { id: string };
          updateCurrentProject(firstProject.id);
        }
        // If current project doesn't exist, clear it
        else if (
          currentProjectId &&
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

  // プロジェクトのサムネイルとプレビューを取得
  useEffect(() => {
    const loadProjectPreviews = async () => {
      const thumbnails: Record<string, string> = {};
      const previews: Record<string, string> = {};

      for (const project of projects) {
        try {
          // プロジェクトのボード一覧を取得
          const boardsRef = ref(rtdb, `boards`);
          const boardsSnapshot = await get(boardsRef);
          const allBoards = boardsSnapshot.val() || {};

          // このプロジェクトのボードをフィルタリング
          const projectBoards = Object.entries(allBoards)
            .filter(
              // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars
              ([_, board]: [string, any]) => board.projectId === project.id
            )
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            .map(([id, board]: [string, any]) => ({ ...board, id }));

          if (projectBoards.length > 0) {
            // 最初のボードの情報を取得
            const firstBoard = projectBoards[0];
            const boardInfo = await getBoardInfo(firstBoard.id);

            if (boardInfo.thumbnailUrl) {
              thumbnails[project.id] = boardInfo.thumbnailUrl;
            } else if (boardInfo.description) {
              previews[project.id] = boardInfo.description;
            }
          }
        } catch (error) {
          console.error("Failed to load project preview:", error);
        }
      }
    };

    if (projects.length > 0) {
      loadProjectPreviews();
    }
  }, [projects]);

  if (loading || checkingRecent) {
    return <div className="loading"></div>;
  }

  return (
    <div className="welcome-screen">
      <div className="welcome-content">
        <div className="welcome-card">
          <h2>Welcome to Whiteboard!</h2>
          <p>
            You don't have any projects yet. Let's create your first project to
            get started.
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
