import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { auth, rtdb, db } from "../config/firebase";
import { ref, get, remove, set } from "firebase/database";
import { doc, deleteDoc } from "firebase/firestore";
import { deleteUser, updateProfile } from "firebase/auth";
import { User, UserProfile } from "../types";
import {
  getUserProfile,
  updateUserProfile,
  checkUsernameAvailability,
  validateUsername,
} from "../utils/userProfile";
import "./UserSettings.css";

interface UserSettingsProps {
  user: User;
}

export function UserSettings({ user }: UserSettingsProps) {
  const navigate = useNavigate();
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const [displayName, setDisplayName] = useState(user.displayName || "");
  const [username, setUsername] = useState("");
  const [isUpdatingProfile, setIsUpdatingProfile] = useState(false);
  const [usernameError, setUsernameError] = useState<string>("");
  const [isCheckingUsername, setIsCheckingUsername] = useState(false);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [isLoadingProfile, setIsLoadingProfile] = useState(true);

  // ユーザープロフィールをロード
  useEffect(() => {
    const loadUserProfile = async () => {
      try {
        const profile = await getUserProfile(user.uid);
        setUserProfile(profile);
        if (profile) {
          setUsername(profile.username);
        }
      } catch (error) {
        console.error("Error loading user profile:", error);
      } finally {
        setIsLoadingProfile(false);
      }
    };

    loadUserProfile();
  }, [user.uid]);

  const handleUsernameChange = async (value: string) => {
    setUsername(value);

    if (!value.trim()) {
      setUsernameError("");
      return;
    }

    // 形式チェック
    const validation = validateUsername(value);
    if (!validation.isValid) {
      setUsernameError(validation.error || "Invalid username");
      return;
    }

    // 現在のユーザー名と同じ場合はチェックしない
    if (value.toLowerCase() === userProfile?.username) {
      setUsernameError("");
      return;
    }

    // 重複チェック
    setIsCheckingUsername(true);
    const isAvailable = await checkUsernameAvailability(value, user.uid);
    setIsCheckingUsername(false);

    if (!isAvailable) {
      setUsernameError("Username is already taken");
    } else {
      setUsernameError("");
    }
  };

  const handleDeleteAccount = async () => {
    const userInput = window.prompt(
      `To delete your account, please type your email address exactly as shown:\n\n${user.email}`
    );

    if (!userInput) {
      return; // User cancelled
    }

    if (userInput !== user.email) {
      alert("Email address doesn't match. Account deletion cancelled.");
      return;
    }

    setIsDeletingAccount(true);
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) {
        throw new Error("No authenticated user");
      }

      // First, remove user from all projects before deleting the account
      await removeUserFromAllProjects(user.uid);

      // Delete the user's profile data
      await deleteUserData(user.uid);

      // Finally, delete the Firebase Auth user
      await deleteUser(currentUser);
      
      // User deletion successful, user will be automatically logged out
      navigate("/");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
      console.error("Error deleting account:", error);

      if (error.code === "auth/requires-recent-login") {
        alert(
          "For security reasons, please logout and login again before deleting your account."
        );
      } else {
        alert("Failed to delete account. Please try again.");
      }

      setIsDeletingAccount(false);
    }
  };

  const removeUserFromAllProjects = async (userId: string) => {
    try {
      // Get all projects the user is a member of
      const userProjectsRef = ref(rtdb, `userProjects/${userId}`);
      const userProjectsSnapshot = await get(userProjectsRef);
      
      if (userProjectsSnapshot.exists()) {
        const userProjects = userProjectsSnapshot.val();
        const projectIds = Object.keys(userProjects);
        
        // Remove user from each project
        const removePromises = projectIds.map(async (projectId) => {
          try {
            // Remove user from project members
            const projectMemberRef = ref(rtdb, `projects/${projectId}/members/${userId}`);
            await remove(projectMemberRef);
            
            // Check if the user was the owner and the project has other members
            const projectRef = ref(rtdb, `projects/${projectId}`);
            const projectSnapshot = await get(projectRef);
            
            if (projectSnapshot.exists()) {
              const projectData = projectSnapshot.val();
              const members = projectData.members || {};
              const remainingMembers = Object.keys(members).filter(id => id !== userId);
              
              if (remainingMembers.length === 0) {
                // If no remaining members, delete the entire project
                await deleteProject(projectId);
              } else if (projectData.members?.[userId]?.role === "owner") {
                // If user was owner but there are other members, transfer ownership to first remaining member
                const newOwnerId = remainingMembers[0];
                const newOwnerRef = ref(rtdb, `projects/${projectId}/members/${newOwnerId}/role`);
                await set(newOwnerRef, "owner");
              }
            }
          } catch (error) {
            console.error(`Error removing user from project ${projectId}:`, error);
          }
        });
        
        await Promise.all(removePromises);
      }
    } catch (error) {
      console.error("Error removing user from projects:", error);
    }
  };

  const deleteProject = async (projectId: string) => {
    try {
      // Remove project
      const projectRef = ref(rtdb, `projects/${projectId}`);
      await remove(projectRef);

      // Remove project boards, notes and cursors
      const projectBoardsRef = ref(rtdb, `projectBoards/${projectId}`);
      const projectNotesRef = ref(rtdb, `projectNotes/${projectId}`);
      const projectCursorsRef = ref(rtdb, `projectCursors/${projectId}`);
      
      await Promise.all([
        remove(projectBoardsRef),
        remove(projectNotesRef),
        remove(projectCursorsRef)
      ]);
      
      // Remove invite mapping if exists
      const projectSnapshot = await get(ref(rtdb, `projects/${projectId}`));
      if (projectSnapshot.exists()) {
        const projectData = projectSnapshot.val();
        if (projectData.inviteCode) {
          const inviteRef = ref(rtdb, `invites/${projectData.inviteCode}`);
          await remove(inviteRef);
        }
      }
    } catch (error) {
      console.error(`Error deleting project ${projectId}:`, error);
    }
  };

  const deleteUserData = async (userId: string) => {
    try {
      // Remove user's project list from Realtime Database
      const userProjectsRef = ref(rtdb, `userProjects/${userId}`);
      await remove(userProjectsRef);
      
      // Remove user profile data from Firestore
      const userProfileDoc = doc(db, "userProfiles", userId);
      await deleteDoc(userProfileDoc);
      
      // Remove user's cursor data from all boards
      await removeUserCursors(userId);
      
      // Remove any other user-related data
      // You may need to add more cleanup based on your data structure
      
    } catch (error) {
      console.error("Error deleting user data:", error);
    }
  };

  const removeUserCursors = async (userId: string) => {
    try {
      // Get all boards to clean up cursor data
      const boardsRef = ref(rtdb, "boards");
      const boardsSnapshot = await get(boardsRef);
      
      if (boardsSnapshot.exists()) {
        const boards = boardsSnapshot.val();
        const boardIds = Object.keys(boards);
        
        // Remove user's cursors from all boards
        const cursorCleanupPromises = boardIds.map(async (boardId) => {
          try {
            const boardCursorsRef = ref(rtdb, `boardCursors/${boardId}`);
            const cursorsSnapshot = await get(boardCursorsRef);
            
            if (cursorsSnapshot.exists()) {
              const cursors = cursorsSnapshot.val();
              const cursorIds = Object.keys(cursors);
              
              // Find and remove cursors that belong to this user
              const userCursorIds = cursorIds.filter(cursorId => 
                cursorId.startsWith(`${userId}-`)
              );
              
              const removePromises = userCursorIds.map(cursorId => {
                const cursorRef = ref(rtdb, `boardCursors/${boardId}/${cursorId}`);
                return remove(cursorRef);
              });
              
              await Promise.all(removePromises);
            }
          } catch (error) {
            console.error(`Error removing cursors for board ${boardId}:`, error);
          }
        });
        
        await Promise.all(cursorCleanupPromises);
      }
    } catch (error) {
      console.error("Error removing user cursors:", error);
    }
  };

  const handleUpdateProfile = async () => {
    if (!displayName.trim()) {
      alert("Display name cannot be empty");
      return;
    }

    if (!username.trim()) {
      alert("Username cannot be empty");
      return;
    }

    if (usernameError) {
      alert("Please fix the username error");
      return;
    }

    setIsUpdatingProfile(true);
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) {
        throw new Error("No authenticated user");
      }

      // Firebase Authのプロフィールを更新
      await updateProfile(currentUser, {
        displayName: displayName.trim(),
        photoURL: null,
      });

      // Firestoreにユーザープロフィールを保存
      const updatedProfile: UserProfile = {
        uid: user.uid,
        username: username.toLowerCase(),
        displayName: displayName.trim(),
        photoURL: null,
        email: user.email || "",
        createdAt: userProfile?.createdAt || Date.now(),
        updatedAt: Date.now(),
      };

      const success = await updateUserProfile(updatedProfile);
      if (!success) {
        throw new Error("Failed to save user profile");
      }

      // Force a page refresh to update the user state
      window.location.reload();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
      console.error("Error updating profile:", error);
      alert("Failed to update profile. Please try again.");
    } finally {
      setIsUpdatingProfile(false);
    }
  };

  return (
    <div className="user-settings">
      <div className="settings-container">
        {/* User Information */}
        <div className="settings-section">
          <h2>Profile</h2>
          <div className="user-profile">
            <div className="user-avatar">
              <div className="avatar-placeholder">
                {(displayName || user.displayName || user.email || "U")
                  .charAt(0)
                  .toUpperCase()}
              </div>
            </div>
            <div className="user-details">
              <div className="setting-item">
                <label>Display Name</label>
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Enter display name"
                  disabled={isUpdatingProfile || isLoadingProfile}
                />
              </div>
              <div className="setting-item">
                <label>Username</label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => handleUsernameChange(e.target.value)}
                  placeholder="Enter username"
                  disabled={isUpdatingProfile || isLoadingProfile}
                  style={{
                    borderColor: usernameError ? "#ff4444" : undefined,
                  }}
                />
                {isCheckingUsername && (
                  <div
                    style={{
                      fontSize: "12px",
                      color: "#666",
                      marginTop: "4px",
                    }}
                  >
                    Checking availability...
                  </div>
                )}
                {usernameError && (
                  <div
                    style={{
                      fontSize: "12px",
                      color: "#ff4444",
                      marginTop: "4px",
                    }}
                  >
                    {usernameError}
                  </div>
                )}
                {!usernameError &&
                  username &&
                  !isCheckingUsername &&
                  username.toLowerCase() !== userProfile?.username && (
                    <div
                      style={{
                        fontSize: "12px",
                        color: "#4CAF50",
                        marginTop: "4px",
                      }}
                    >
                      Username is available
                    </div>
                  )}
              </div>
              <div className="setting-item">
                <label>Email</label>
                <span>{user.email}</span>
              </div>
              <div className="setting-item">
                <div style={{ display: "flex", gap: "8px" }}>
                  <div>
                    <button
                      onClick={handleUpdateProfile}
                      disabled={
                        isUpdatingProfile ||
                        isLoadingProfile ||
                        !displayName.trim() ||
                        !username.trim() ||
                        !!usernameError ||
                        isCheckingUsername
                      }
                      className="save-btn"
                    >
                      {isUpdatingProfile ? "Saving..." : "Save"}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="settings-section">
          <h2>Delete Account</h2>
          <div className="setting-item">
            <div>
              <button
                onClick={handleDeleteAccount}
                disabled={isDeletingAccount}
                className="delete-account-btn"
              >
                {isDeletingAccount ? "Deleting..." : "Delete Account"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
