import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { rtdb } from "../config/firebase";
import { ref, get, set, remove } from "firebase/database";
import { customAlphabet } from "nanoid";
import { User, Project } from "../types";
import { canManageAdmins, isProjectAdmin } from "../utils/permissions";
import "./SettingsCommon.css";

interface ProjectSettingsProps {
  user: User;
}

interface Member {
  uid: string;
  displayName?: string;
  email?: string;
  role: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
}

export function ProjectSettings({ user }: ProjectSettingsProps) {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [newProjectName, setNewProjectName] = useState("");
  const [newProjectSlug, setNewProjectSlug] = useState("");
  const [members, setMembers] = useState<Member[]>([]);
  const [isOwner, setIsOwner] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [canManageAdminsFlag, setCanManageAdminsFlag] = useState(false);

  useEffect(() => {
    const loadProject = async () => {
      try {
        const projectRef = ref(rtdb, `projects/${projectId}`);
        const projectSnapshot = await get(projectRef);

        if (projectSnapshot.exists()) {
          const projectData = { id: projectId, ...projectSnapshot.val() };
          setProject(projectData);
          setNewProjectName(projectData.name);
          setNewProjectSlug(projectData.slug || "");

          // Check user role
          const userMember = projectData.members?.[user.uid];
          if (userMember) {
            setIsOwner(userMember.role === "owner");
            setIsAdmin(isProjectAdmin(projectData, user.uid));
            setCanManageAdminsFlag(canManageAdmins(projectData, user.uid));
          } else {
            // User is not a member
            setIsOwner(false);
            setIsAdmin(false);
            setCanManageAdminsFlag(false);
          }

          // Convert members object to array for easier rendering
          if (projectData.members) {
            const membersArray = Object.entries(projectData.members).map(
              ([uid, member]) => ({
                uid,
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
  }, [projectId, navigate, user.uid]);

  const updateProjectName = async () => {
    if (!isAdmin) {
      alert("Admin privileges required to modify project settings");
      return;
    }

    if (!newProjectName.trim() || newProjectName === project?.name) {
      setNewProjectName(project?.name || "");
      return;
    }

    try {
      const projectRef = ref(rtdb, `projects/${projectId}/name`);
      await set(projectRef, newProjectName);

      setProject((prev) => (prev ? { ...prev, name: newProjectName } : null));
    } catch (error) {
      console.error("Error updating project name:", error);
      alert("Failed to update project name");
    }
  };

  const updateProjectSlug = async () => {
    if (!isAdmin) {
      alert("Admin privileges required to modify project settings");
      return;
    }

    if (!newProjectSlug.trim() || newProjectSlug === project?.slug) {
      setNewProjectSlug(project?.slug || "");
      return;
    }

    // Validate slug format
    const slugPattern = /^[a-z0-9-]+$/;
    if (!slugPattern.test(newProjectSlug)) {
      alert("Slug can only contain lowercase letters, numbers, and hyphens");
      return;
    }

    try {
      const projectRef = ref(rtdb, `projects/${projectId}/slug`);
      await set(projectRef, newProjectSlug);

      setProject((prev) => (prev ? { ...prev, slug: newProjectSlug } : null));
    } catch (error) {
      console.error("Error updating project slug:", error);
      alert("Failed to update project slug");
    }
  };

  const updateProjectPrivacy = async (isPublic: boolean) => {
    if (!isAdmin) {
      alert("Admin privileges required to modify project settings");
      return;
    }

    try {
      const projectRef = ref(rtdb, `projects/${projectId}/isPublic`);
      await set(projectRef, isPublic);

      setProject((prev) => (prev ? { ...prev, isPublic } : null));
    } catch (error) {
      console.error("Error updating project privacy:", error);
      alert("Failed to update project privacy");
    }
  };

  const removeMember = async (memberUid: string) => {
    if (!isAdmin) {
      alert("Admin privileges required to remove members");
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

  const promoteToAdmin = async (memberUid: string) => {
    if (!canManageAdminsFlag) {
      alert("Only project owners can manage administrators");
      return;
    }

    if (!window.confirm("Are you sure you want to promote this member to admin?")) {
      return;
    }

    try {
      const memberRef = ref(rtdb, `projects/${projectId}/members/${memberUid}/role`);
      await set(memberRef, "admin");

      // Update local state
      setMembers((prev) => 
        prev.map((member) => 
          member.uid === memberUid 
            ? { ...member, role: "admin" }
            : member
        )
      );
    } catch (error) {
      console.error("Error promoting member:", error);
      alert("Failed to promote member");
    }
  };

  const demoteFromAdmin = async (memberUid: string) => {
    if (!canManageAdminsFlag) {
      alert("Only project owners can manage administrators");
      return;
    }

    if (!window.confirm("Are you sure you want to demote this admin to member?")) {
      return;
    }

    try {
      const memberRef = ref(rtdb, `projects/${projectId}/members/${memberUid}/role`);
      await set(memberRef, "member");

      // Update local state
      setMembers((prev) => 
        prev.map((member) => 
          member.uid === memberUid 
            ? { ...member, role: "member" }
            : member
        )
      );
    } catch (error) {
      console.error("Error demoting admin:", error);
      alert("Failed to demote admin");
    }
  };

  const generateInviteCode = async () => {
    if (!isAdmin) {
      alert("Admin privileges required to generate invite codes");
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
      setProject((prev) =>
        prev ? { ...prev, inviteCode: newInviteCode } : null
      );

      alert("New invite link generated!");
    } catch (error) {
      console.error("Error generating invite code:", error);
      alert("Failed to generate invite code");
    }
  };

  const copyInviteLink = async () => {
    if (!project?.inviteCode) {
      if (isAdmin) {
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
    } catch {
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

    const userInput = window.prompt(
      `To delete this project, please type the project name exactly as shown:\n\n${project?.name}`
    );

    if (!userInput) {
      return; // User cancelled
    }

    if (userInput !== project?.name) {
      alert("Project name doesn't match. Project deletion cancelled.");
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
    return <div className="loading"></div>;
  }

  if (!project) {
    return <div className="loading">Project not found</div>;
  }

  if (!isAdmin) {
    return (
      <div className="project-settings">
        <div className="settings-container">
          <div className="settings-section">
            <h2>Access Denied</h2>
            <p>Admin privileges required to access project settings.</p>
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
      <div className="settings-container">
        {/* Project Information */}
        <div className="settings-section">
          <h2>Project Information</h2>
          <div className="setting-item">
            <label>Project Name</label>
            <div className="edit-name-container">
              <input
                type="text"
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
                onKeyPress={(e) => e.key === "Enter" && updateProjectName()}
                autoFocus
              />
            </div>
            <div>
              <button onClick={updateProjectName} className="save-btn">
                Save
              </button>
            </div>
          </div>
          
          <div className="setting-item">
            <label htmlFor="project-slug">Project Slug</label>
            <div className="edit-name-container">
              <input
                id="project-slug"
                type="text"
                value={newProjectSlug}
                onChange={(e) => setNewProjectSlug(e.target.value)}
                onKeyPress={(e) => e.key === "Enter" && updateProjectSlug()}
                placeholder="project-slug"
                pattern="[a-z0-9-]+"
                disabled={!isAdmin}
              />
            </div>
            <div>
              <button onClick={updateProjectSlug} className="save-btn" disabled={!isAdmin}>
                Save
              </button>
            </div>
          </div>
        </div>

        {/* Privacy Settings */}
        <div className="settings-section">
          <h2>Privacy Settings</h2>
          <div className="setting-item">
            <label>Project Visibility</label>
            <div className="privacy-toggle">
              <div className="privacy-option">
                <input
                  type="radio"
                  id="public"
                  name="privacy"
                  value="public"
                  checked={project.isPublic}
                  onChange={() => updateProjectPrivacy(true)}
                  disabled={!isAdmin}
                />
                <label htmlFor="public">
                  <strong>Public</strong>
                  <span>Anyone can view this project (read-only)</span>
                </label>
              </div>
              <div className="privacy-option">
                <input
                  type="radio"
                  id="private"
                  name="privacy"
                  value="private"
                  checked={!project.isPublic}
                  onChange={() => updateProjectPrivacy(false)}
                  disabled={!isAdmin}
                />
                <label htmlFor="private">
                  <strong>Private</strong>
                  <span>Only invited members can access this project</span>
                </label>
              </div>
            </div>
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
            </div>
            <div className="btn-section">
              <button onClick={copyInviteLink} className="copy-btn">
                Copy
              </button>
              {isAdmin && (
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
                      {member.role === "owner" 
                        ? "Owner" 
                        : member.role === "admin" 
                        ? "Admin" 
                        : "Member"}
                      {member.uid === user.uid && " (You)"}
                    </div>
                  </div>
                </div>
                <div className="member-actions">
                  {canManageAdminsFlag && member.uid !== user.uid && member.role === "member" && (
                    <button
                      onClick={() => promoteToAdmin(member.uid)}
                      className="promote-btn"
                    >
                      Promote to Admin
                    </button>
                  )}
                  {canManageAdminsFlag && member.uid !== user.uid && member.role === "admin" && (
                    <button
                      onClick={() => demoteFromAdmin(member.uid)}
                      className="demote-btn"
                    >
                      Demote to Member
                    </button>
                  )}
                  {isAdmin && member.uid !== user.uid && (
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
            <h2>Delete Project</h2>
            <div className="setting-item">
              <p>
                This will permanently delete the project, all boards, and all
                notes. This action cannot be undone.
              </p>
              <div>
                <button onClick={deleteProject} className="danger-btn">
                  Delete Project
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
