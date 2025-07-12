import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { rtdb } from "../config/firebase";
import { ref, get, set } from "firebase/database";

export function InviteJoin({ user }) {
  const { inviteCode } = useParams();
  const navigate = useNavigate();
  const [project, setProject] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [joining, setJoining] = useState(false);

  useEffect(() => {
    const checkInvite = async () => {
      try {
        // Get invite information
        const inviteRef = ref(rtdb, `invites/${inviteCode}`);
        const inviteSnapshot = await get(inviteRef);

        if (!inviteSnapshot.exists()) {
          setError("Invite link is invalid.");
          setLoading(false);
          return;
        }

        const inviteData = inviteSnapshot.val();
        const projectId = inviteData.projectId;

        // Get project information
        const projectRef = ref(rtdb, `projects/${projectId}`);
        const projectSnapshot = await get(projectRef);

        if (!projectSnapshot.exists()) {
          setError("Project not found.");
          setLoading(false);
          return;
        }

        const projectData = { id: projectId, ...projectSnapshot.val() };

        // Check if user is already a member
        if (projectData.members && projectData.members[user.uid]) {
          setError("You are already a member of this project.");
          setLoading(false);
          return;
        }

        setProject(projectData);
        setLoading(false);
      } catch (err) {
        setError("An error occurred while checking the invite link.");
        setLoading(false);
      }
    };

    checkInvite();
  }, [inviteCode, user.uid]);

  const joinProject = async () => {
    if (!project) return;

    setJoining(true);
    try {
      // Add user to project members
      const memberRef = ref(rtdb, `projects/${project.id}/members/${user.uid}`);
      await set(memberRef, {
        email: user.email,
        displayName: user.displayName || user.email,
        role: "member",
        joinedAt: Date.now(),
      });

      // Add project to user's project list
      const userProjectRef = ref(
        rtdb,
        `userProjects/${user.uid}/${project.id}`
      );
      await set(userProjectRef, { role: "member", joinedAt: Date.now() });

      navigate(`/project/${project.id}`);
    } catch (err) {
      setError("An error occurred while joining the project.");
      setJoining(false);
    }
  };

  if (loading) {
    return (
      <div className="invite-join">
        <div className="invite-card">
          <h2>Checking invitation...</h2>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="invite-join">
        <div className="invite-card error">
          <h2>Error</h2>
          <p>{error}</p>
          <button onClick={() => navigate("/")} className="cancel-btn">
            Back to Projects
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="invite-join">
      <div className="invite-card">
        <h2>You've been invited to a project</h2>
        <div className="project-preview">
          <h3>{project.name}</h3>
          <p>Members: {Object.keys(project.members || {}).length}</p>
        </div>
        <p>Would you like to join this project?</p>
        <div className="invite-actions">
          <button onClick={joinProject} disabled={joining} className="join-btn">
            {joining ? "Joining..." : "Join"}
          </button>
          <button onClick={() => navigate("/")} className="cancel-btn">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
