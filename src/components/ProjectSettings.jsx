import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { rtdb, auth } from "../config/firebase";
import { ref, get, set, remove } from "firebase/database";
import { signOut } from "firebase/auth";
import { Header } from "./Header";
import "./ProjectSettings.css";

export function ProjectSettings({ user }) {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const [project, setProject] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isEditingName, setIsEditingName] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [members, setMembers] = useState([]);

  useEffect(() => {
    const loadProject = async () => {
      try {
        const projectRef = ref(rtdb, `projects/${projectId}`);
        const projectSnapshot = await get(projectRef);

        if (projectSnapshot.exists()) {
          const projectData = { id: projectId, ...projectSnapshot.val() };
          setProject(projectData);
          setNewProjectName(projectData.name);

          // Convert members object to array for easier rendering
          if (projectData.members) {
            const membersArray = Object.entries(projectData.members).map(
              ([uid, member]) => ({
                uid,
                ...member,
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
    if (!newProjectName.trim() || newProjectName === project.name) {
      setIsEditingName(false);
      setNewProjectName(project.name);
      return;
    }

    try {
      const projectRef = ref(rtdb, `projects/${projectId}/name`);
      await set(projectRef, newProjectName);

      setProject((prev) => ({ ...prev, name: newProjectName }));
      setIsEditingName(false);
    } catch (error) {
      console.error("Error updating project name:", error);
      alert("Failed to update project name");
    }
  };

  const removeMember = async (memberUid) => {
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

  const copyInviteLink = async () => {
    const baseUrl = window.location.origin;
    const inviteUrl = `${baseUrl}/invite/${project.inviteCode}`;

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
      if (project.members) {
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
      if (project.inviteCode) {
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

  const isOwner = project.createdBy === user.uid;

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
            {isEditingName ? (
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

          <div className="setting-item">
            <label>Created</label>
            <span>{new Date(project.createdAt).toLocaleDateString()}</span>
          </div>

          <div className="setting-item">
            <label>Project ID</label>
            <span className="project-id">{projectId}</span>
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
                value={`${window.location.origin}/invite/${project.inviteCode}`}
                readOnly
                className="invite-link-input"
                onClick={(e) => e.target.select()}
              />
              <button onClick={copyInviteLink} className="copy-btn">
                Copy
              </button>
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
