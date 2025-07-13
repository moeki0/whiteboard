import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { rtdb } from "../config/firebase";
import { ref, set } from "firebase/database";
import { customAlphabet } from "nanoid";
import { useProject } from "../contexts/ProjectContext";
import { Header } from "./Header";
import { User } from "../types";
import "./ProjectCreate.css";

interface ProjectCreateProps {
  user: User;
}

export function ProjectCreate({ user }: ProjectCreateProps) {
  const navigate = useNavigate();
  const { updateCurrentProject } = useProject();
  const [projectName, setProjectName] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const nanoid = customAlphabet('ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789', 21);

  const createProject = async () => {
    if (!projectName.trim()) {
      alert("Please enter a project name");
      return;
    }

    setIsCreating(true);
    try {
      const projectId = nanoid();
      const inviteCode = customAlphabet('ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789', 12)();
      const project = {
        name: projectName.trim(),
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

      // Update current project and navigate
      updateCurrentProject(projectId);
      navigate("/");
    } catch (error) {
      console.error("Error creating project:", error);
      alert("Failed to create project. Please try again.");
      setIsCreating(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !isCreating) {
      createProject();
    }
  };

  return (
    <div className="project-create">
      <Header title="Create New Project" user={user} />

      <div className="create-container">
        <div className="create-section">
          <h2>Project Details</h2>
          <div className="create-form">
            <div className="form-group">
              <label htmlFor="projectName">Project Name</label>
              <input
                id="projectName"
                type="text"
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Enter project name"
                maxLength={100}
                autoFocus
                disabled={isCreating}
              />
              <small className="form-help">
                Choose a descriptive name for your project
              </small>
            </div>

            <div className="form-actions">
              <button
                onClick={createProject}
                disabled={isCreating || !projectName.trim()}
                className="create-btn"
              >
                {isCreating ? "Creating..." : "Create Project"}
              </button>
              <button
                onClick={() => navigate("/")}
                disabled={isCreating}
                className="cancel-btn"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
