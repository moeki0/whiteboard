import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { rtdb } from "../config/firebase";
import { ref, set } from "firebase/database";
import { customAlphabet } from "nanoid";
import { useProject } from "../contexts/ProjectContext";
import { User } from "../types";
import { 
  generateSlugFromName, 
  validateSlug, 
  checkSlugAvailability,
  generateUniqueSlug 
} from "../utils/slugGenerator";
import "./ProjectCreate.css";

interface ProjectCreateProps {
  user: User;
}

export function ProjectCreate({ user }: ProjectCreateProps) {
  const navigate = useNavigate();
  const { updateCurrentProject } = useProject();
  const [projectName, setProjectName] = useState("");
  const [projectSlug, setProjectSlug] = useState("");
  const [slugError, setSlugError] = useState("");
  const [isCheckingSlug, setIsCheckingSlug] = useState(false);
  const [isPublic, setIsPublic] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const nanoid = customAlphabet(
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789",
    21
  );

  // Auto-generate slug from project name
  useEffect(() => {
    if (projectName.trim()) {
      const generatedSlug = generateSlugFromName(projectName);
      setProjectSlug(generatedSlug);
    }
  }, [projectName]);

  // Validate slug when it changes
  useEffect(() => {
    if (!projectSlug) {
      setSlugError("");
      return;
    }

    const validateAndCheckSlug = async () => {
      setIsCheckingSlug(true);
      setSlugError("");

      // First validate format
      const validation = validateSlug(projectSlug);
      if (!validation.isValid) {
        setSlugError(validation.error || "Invalid slug format");
        setIsCheckingSlug(false);
        return;
      }

      // Then check availability
      const availability = await checkSlugAvailability(projectSlug);
      if (!availability.isAvailable) {
        setSlugError(availability.error || "Slug is not available");
      }

      setIsCheckingSlug(false);
    };

    const timeoutId = setTimeout(validateAndCheckSlug, 500);
    return () => clearTimeout(timeoutId);
  }, [projectSlug]);

  const createProject = async () => {
    if (!projectName.trim()) {
      alert("Please enter a project name");
      return;
    }

    if (!projectSlug.trim()) {
      alert("Please enter a project slug");
      return;
    }

    if (slugError) {
      alert("Please fix the slug error before creating the project");
      return;
    }

    setIsCreating(true);
    try {
      // Generate unique slug if needed
      const finalSlug = await generateUniqueSlug(projectName.trim());
      
      const projectId = nanoid();
      const inviteCode = customAlphabet(
        "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789",
        12
      )();
      const project = {
        name: projectName.trim(),
        slug: finalSlug,
        createdBy: user.uid,
        createdAt: Date.now(),
        inviteCode: inviteCode,
        isPublic: isPublic,
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

      // Update current project and navigate to the new project
      updateCurrentProject(projectId);
      navigate(`/${finalSlug}`);
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
                maxLength={100}
                autoFocus
                disabled={isCreating}
              />
            </div>

            <div className="form-group">
              <label htmlFor="projectSlug">
                Project URL
                <small>Your project will be accessible at: /{projectSlug || 'your-project-url'}</small>
              </label>
              <input
                id="projectSlug"
                type="text"
                value={projectSlug}
                onChange={(e) => setProjectSlug(e.target.value.toLowerCase())}
                onKeyPress={handleKeyPress}
                maxLength={50}
                disabled={isCreating}
                placeholder="your-project-url"
              />
              {isCheckingSlug && (
                <small className="slug-status checking">Checking availability...</small>
              )}
              {slugError && (
                <small className="slug-status error">{slugError}</small>
              )}
              {projectSlug && !slugError && !isCheckingSlug && (
                <small className="slug-status success">✓ Available</small>
              )}
            </div>

            <div className="form-group">
              <label>Privacy Settings</label>
              <div className="radio-group">
                <label className="radio-label">
                  <input
                    type="radio"
                    name="privacy"
                    checked={isPublic}
                    onChange={() => setIsPublic(true)}
                    disabled={isCreating}
                  />
                  <span className="radio-text">
                    <strong>Public</strong>
                    <small>
                      Anyone with the link can view and edit boards in this
                      project
                    </small>
                  </span>
                </label>
                <label className="radio-label">
                  <input
                    type="radio"
                    name="privacy"
                    checked={!isPublic}
                    onChange={() => setIsPublic(false)}
                    disabled={isCreating}
                  />
                  <span className="radio-text">
                    <strong>Private</strong>
                    <small>Only invited members can access this project</small>
                  </span>
                </label>
              </div>
            </div>

            <div className="form-actions">
              <button
                onClick={createProject}
                disabled={isCreating || !projectName.trim() || !projectSlug.trim() || !!slugError || isCheckingSlug}
                className="create-btn"
              >
                {isCreating ? "Creating..." : "Create Project"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
