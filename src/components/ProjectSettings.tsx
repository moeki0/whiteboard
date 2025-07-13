import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { rtdb } from "../config/firebase";
import { ref, get, set, remove } from "firebase/database";
import { customAlphabet } from "nanoid";
import { Header } from "./Header";
import { User, Project } from "../types";
import "./ProjectSettings.css";

interface ProjectSettingsProps {
  user: User;
}

interface Member {
  uid: string;
  displayName?: string;
  email?: string;
  role: string;
  [key: string]: any;
}

export function ProjectSettings({ user }: ProjectSettingsProps) {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [isEditingName, setIsEditingName] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [members, setMembers] = useState<Member[]>([]);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [isOwner, setIsOwner] = useState(false);

  useEffect(() => {
    const loadProject = async () => {
      try {
        const projectRef = ref(rtdb, `projects/${projectId}`);
        const projectSnapshot = await get(projectRef);

        if (projectSnapshot.exists()) {
          const projectData = { id: projectId, ...projectSnapshot.val() };
          setProject(projectData);
          setNewProjectName(projectData.name);

          // Check user role
          const userMember = projectData.members?.[user.uid];
          if (userMember) {
            setUserRole(userMember.role);
            setIsOwner(userMember.role === "owner");
          } else {
            // User is not a member
            setUserRole(null);
            setIsOwner(false);
          }

          // Convert members object to array for easier rendering
          if (projectData.members) {
            const membersArray = Object.entries(projectData.members).map(
              ([uid, member]) => ({
                uid,
                ...(member as any),
              })
            );
            setMembers(membersArray);
          }
        } else {
          navigate("/");
        }
      } catch (error) {
        console.error("Error loading project:", error);
        navigate("/");
      } finally {
        setLoading(false);
      }
    };

    loadProject();
  }, [projectId, navigate]);

  const updateProjectName = async () => {
    if (!isOwner) {
      alert("Only project owners can modify project settings");
      return;
    }

    if (!newProjectName.trim() || newProjectName === project?.name) {
      setIsEditingName(false);
      setNewProjectName(project?.name || "");
      return;
    }

    try {
      const projectRef = ref(rtdb, `projects/${projectId}/name`);
      await set(projectRef, newProjectName);

      setProject((prev) => (prev ? { ...prev, name: newProjectName } : null));
      setIsEditingName(false);
    } catch (error) {
      console.error("Error updating project name:", error);
      alert("Failed to update project name");
    }
  };

  const removeMember = async (memberUid: string) => {
    if (!isOwner) {
      alert("Only project owners can remove members");
      return;
    }

    if (memberUid === user.uid) {
      alert("You cannot remove yourself from the project");
      return;
    }

    if (!window.confirm("Are you sure you want to remove this member?")) {
      return;
    }

    try {
      // Remove from project members
      const memberRef = ref(rtdb, `projects/${projectId}/members/${memberUid}`);
      await remove(memberRef);

      // Remove project from user's project list
      const userProjectRef = ref(
        rtdb,
        `userProjects/${memberUid}/${projectId}`
      );
      await remove(userProjectRef);

      // Update local state
      setMembers((prev) => prev.filter((member) => member.uid !== memberUid));
    } catch (error) {
      console.error("Error removing member:", error);
      alert("Failed to remove member");
    }
  };

  const generateInviteCode = async () => {
    if (!isOwner) {
      alert("Only project owners can generate invite codes");
      return;
    }

    try {
      const nanoid = customAlphabet(
        "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789",
        12
      );
      const newInviteCode = nanoid();

      // Update project with new invite code
      const projectRef = ref(rtdb, `projects/${projectId}/inviteCode`);
      await set(projectRef, newInviteCode);

      // Create invite mapping
      const inviteRef = ref(rtdb, `invites/${newInviteCode}`);
      await set(inviteRef, { projectId: projectId, createdAt: Date.now() });

      // Update local state
      setProject((prev) => (prev ? { ...prev, inviteCode: newInviteCode } : null));

      alert("New invite link generated!");
    } catch (error) {
      console.error("Error generating invite code:", error);
      alert("Failed to generate invite code");
    }
  };

  const copyInviteLink = async () => {
    if (!project?.inviteCode) {
      if (isOwner) {
        const shouldGenerate = window.confirm(
          "No invite code found. Would you like to generate one?"
        );
        if (shouldGenerate) {
          await generateInviteCode();
          return;
        }
      } else {
        alert("No invite code found for this project");
      }
      return;
    }

    const baseUrl = window.location.origin;
    const inviteUrl = `${baseUrl}/invite/${project?.inviteCode}`;

    try {
      await navigator.clipboard.writeText(inviteUrl);
      alert("Invite link copied!");
    } catch (err) {
      // Fallback for older browsers
      const textArea = document.createElement("textarea");
      textArea.value = inviteUrl;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand("copy");
      document.body.removeChild(textArea);
      alert("Invite link copied!");
    }
  };

  const deleteProject = async () => {
    if (!isOwner) {
      alert("Only project owners can delete projects");
      return;
    }

    if (
      !window.confirm(
        "Are you sure you want to delete this project? This action cannot be undone."
      )
    ) {
      return;
    }

    if (
      !window.confirm(
        "This will permanently delete all boards and notes. Are you absolutely sure?"
      )
    ) {
      return;
    }

    try {
      // Remove project
      const projectRef = ref(rtdb, `projects/${projectId}`);
      await remove(projectRef);

      // Remove from all user project lists
      if (project?.members) {
        const memberPromises = Object.keys(project.members).map(
          async (memberId) => {
            const userProjectRef = ref(
              rtdb,
              `userProjects/${memberId}/${projectId}`
            );
            await remove(userProjectRef);
          }
        );
        await Promise.all(memberPromises);
      }

      // Remove project boards, notes and cursors
      const projectBoardsRef = ref(rtdb, `projectBoards/${projectId}`);
      const projectNotesRef = ref(rtdb, `projectNotes/${projectId}`);
      const projectCursorsRef = ref(rtdb, `projectCursors/${projectId}`);
      await remove(projectBoardsRef);
      await remove(projectNotesRef);
      await remove(projectCursorsRef);

      // Remove invite mapping
      if (project?.inviteCode) {
        const inviteRef = ref(rtdb, `invites/${project.inviteCode}`);
        await remove(inviteRef);
      }

      navigate("/");
    } catch (error) {
      console.error("Error deleting project:", error);
      alert("Failed to delete project");
    }
  };

  if (loading) {
    return <div className="loading">Loading...</div>;
  }

  if (!project) {
    return <div className="loading">Project not found</div>;
  }

  if (!userRole) {
    return (
      <div className="project-settings">
        <Header title="Project Settings" user={user} />
        <div className="settings-container">
          <div className="settings-section">
            <h2>Access Denied</h2>
            <p>You don't have permission to access this project's settings.</p>
            <button onClick={() => navigate("/")} className="cancel-btn">
              Back to Home
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="project-settings">
      <Header
        title="Project settings"
        user={user}
        currentProjectId={projectId}
      />

      <div className="settings-container">
        {/* Project Information */}
        <div className="settings-section">
          <h2>Project Information</h2>
          <div className="setting-item">
            <label>Project Name</label>
            {isEditingName && isOwner ? (
              <div className="edit-name-container">
                <input
                  type="text"
                  value={newProjectName}
                  onChange={(e) => setNewProjectName(e.target.value)}
                  onKeyPress={(e) => e.key === "Enter" && updateProjectName()}
                  autoFocus
                />
                <button onClick={updateProjectName} className="save-btn">
                  Save
                </button>
                <button
                  onClick={() => {
                    setIsEditingName(false);
                    setNewProjectName(project.name);
                  }}
                  className="cancel-btn"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <div className="name-display">
                <span>{project.name}</span>
                {isOwner && (
                  <button
                    onClick={() => setIsEditingName(true)}
                    className="edit-btn"
                  >
                    Edit
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Invite Link */}
        <div className="settings-section">
          <h2>Invite Members</h2>
          <div className="setting-item">
            <label>Invite Link</label>
            <div className="invite-link-container">
              <input
                type="text"
                value={
                  project.inviteCode
                    ? `${window.location.origin}/invite/${project.inviteCode}`
                    : "No invite code generated"
                }
                readOnly
                className="invite-link-input"
                onClick={(e) => (e.target as HTMLInputElement).select()}
              />
              <button onClick={copyInviteLink} className="copy-btn">
                Copy
              </button>
              {isOwner && (
                <button onClick={generateInviteCode} className="generate-btn">
                  {project.inviteCode ? "Regenerate" : "Generate"}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Members Management */}
        <div className="settings-section">
          <h2>Members ({members.length})</h2>
          <div className="members-list">
            {members.map((member) => (
              <div key={member.uid} className="member-item">
                <div className="member-info">
                  <div className="member-avatar">
                    {member.displayName?.charAt(0).toUpperCase() || "U"}
                  </div>
                  <div className="member-details">
                    <div className="member-name">
                      {member.displayName || member.email}
                    </div>
                    <div className="member-email">{member.email}</div>
                    <div className="member-role">
                      {member.role === "owner" ? "Owner" : "Member"}
                      {member.uid === user.uid && " (You)"}
                    </div>
                  </div>
                </div>
                <div className="member-actions">
                  {isOwner && member.uid !== user.uid && (
                    <button
                      onClick={() => removeMember(member.uid)}
                      className="remove-member-btn"
                    >
                      Remove
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Danger Zone */}
        {isOwner && (
          <div className="settings-section danger-zone">
            <h2>Danger Zone</h2>
            <div className="setting-item">
              <div className="danger-info">
                <strong>Delete Project</strong>
                <p>
                  This will permanently delete the project, all boards, and all
                  notes. This action cannot be undone.
                </p>
              </div>
              <button onClick={deleteProject} className="danger-btn">
                Delete Project
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
