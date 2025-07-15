import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { auth } from "../config/firebase";
import { signOut, deleteUser, updateProfile } from "firebase/auth";
import { User, UserProfile } from "../types";
import { getUserProfile, updateUserProfile, checkUsernameAvailability, validateUsername } from "../utils/userProfile";
import "./UserSettings.css";

interface UserSettingsProps {
  user: User;
}

export function UserSettings({ user }: UserSettingsProps) {
  const navigate = useNavigate();
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const [displayName, setDisplayName] = useState(user.displayName || "");
  const [username, setUsername] = useState("");
  const [photoURL, setPhotoURL] = useState(user.photoURL || "");
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

      await deleteUser(currentUser);
      // User deletion successful, user will be automatically logged out
      navigate("/");
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

  const handleUpdateProfile = async () => {
    if (!displayName.trim()) {
      alert('Display name cannot be empty');
      return;
    }

    if (!username.trim()) {
      alert('Username cannot be empty');
      return;
    }

    if (usernameError) {
      alert('Please fix the username error');
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
        photoURL: photoURL.trim() || null,
      });

      // Firestoreにユーザープロフィールを保存
      const updatedProfile: UserProfile = {
        uid: user.uid,
        username: username.toLowerCase(),
        displayName: displayName.trim(),
        photoURL: photoURL.trim() || null,
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
    } catch (error: any) {
      console.error("Error updating profile:", error);
      alert("Failed to update profile. Please try again.");
    } finally {
      setIsUpdatingProfile(false);
    }
  };

  const handleReset = () => {
    setDisplayName(user.displayName || "");
    setUsername(userProfile?.username || "");
    setPhotoURL(user.photoURL || "");
    setUsernameError("");
  };

  return (
    <div className="user-settings">
      <div className="settings-container">
        {/* User Information */}
        <div className="settings-section">
          <h2>Profile</h2>
          <div className="user-profile">
            <div className="user-avatar">
              {photoURL ? (
                <img
                  src={photoURL}
                  alt="Profile"
                  referrerPolicy="no-referrer"
                  onError={(e) => {
                    e.currentTarget.style.display = 'none';
                  }}
                />
              ) : (
                <div className="avatar-placeholder">
                  {(displayName || user.displayName || user.email || "U")
                    .charAt(0)
                    .toUpperCase()}
                </div>
              )}
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
                  <div style={{ fontSize: "12px", color: "#666", marginTop: "4px" }}>
                    Checking availability...
                  </div>
                )}
                {usernameError && (
                  <div style={{ fontSize: "12px", color: "#ff4444", marginTop: "4px" }}>
                    {usernameError}
                  </div>
                )}
                {!usernameError && username && !isCheckingUsername && username.toLowerCase() !== userProfile?.username && (
                  <div style={{ fontSize: "12px", color: "#4CAF50", marginTop: "4px" }}>
                    Username is available
                  </div>
                )}
              </div>
              <div className="setting-item">
                <label>Avatar URL</label>
                <input
                  type="url"
                  value={photoURL}
                  onChange={(e) => setPhotoURL(e.target.value)}
                  placeholder="Enter avatar image URL"
                  disabled={isUpdatingProfile || isLoadingProfile}
                />
              </div>
              <div className="setting-item">
                <label>Email</label>
                <span>{user.email}</span>
              </div>
              <div className="setting-item">
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    onClick={handleUpdateProfile}
                    disabled={isUpdatingProfile || isLoadingProfile || !displayName.trim() || !username.trim() || !!usernameError || isCheckingUsername}
                    className="save-btn"
                  >
                    {isUpdatingProfile ? "Saving..." : "Save Changes"}
                  </button>
                  <button
                    onClick={handleReset}
                    disabled={isUpdatingProfile}
                    className="cancel-btn"
                  >
                    Reset
                  </button>
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
