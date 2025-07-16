import { useState } from "react";
import { auth } from "../config/firebase";
import { updateProfile } from "firebase/auth";
import { User, UserProfile } from "../types";
import {
  updateUserProfile,
  checkUsernameAvailability,
  validateUsername,
} from "../utils/userProfile";
import "./UserSettings.css";

interface InitialProfileSetupProps {
  user: User;
  onComplete: () => void;
}

export function InitialProfileSetup({
  user,
  onComplete,
}: InitialProfileSetupProps) {
  const [displayName, setDisplayName] = useState(user.displayName || "");
  const [username, setUsername] = useState("");
  const [photoURL, setPhotoURL] = useState(user.photoURL || "");
  const [isUpdating, setIsUpdating] = useState(false);
  const [usernameError, setUsernameError] = useState<string>("");
  const [isCheckingUsername, setIsCheckingUsername] = useState(false);

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

    // 重複チェック（初回登録時なのでexcludeUidは不要）
    setIsCheckingUsername(true);
    try {
      const isAvailable = await checkUsernameAvailability(value, undefined);
      setIsCheckingUsername(false);

      if (!isAvailable) {
        setUsernameError("Username is already taken");
      } else {
        setUsernameError("");
      }
    } catch (error) {
      console.error("Error checking username:", error);
      setIsCheckingUsername(false);
      setUsernameError("Error checking username availability");
    }
  };

  const handleComplete = async () => {
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

    setIsUpdating(true);
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
      const userProfile: UserProfile = {
        uid: user.uid,
        username: username.toLowerCase(),
        displayName: displayName.trim(),
        photoURL: photoURL.trim() || null,
        email: user.email || "",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      const success = await updateUserProfile(userProfile);
      if (!success) {
        throw new Error("Failed to save user profile");
      }

      onComplete();
    } catch (error: any) {
      console.error("Error updating profile:", error);
      alert("Failed to update profile. Please try again.");
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <div className="page-container">
      <div className="content-container">
        <h2>Profile Setup</h2>
        <p>Please set up your profile to continue.</p>
        
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
                {(displayName || user.email || "U")
                  .charAt(0)
                  .toUpperCase()}
              </div>
            )}
          </div>
          
          <div className="user-details">
            <div className="setting-item">
              <label>Display Name *</label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Enter your display name"
                disabled={isUpdating}
                autoFocus
              />
            </div>
            <div className="setting-item">
              <label>Username *</label>
              <input
                type="text"
                value={username}
                onChange={(e) => handleUsernameChange(e.target.value)}
                placeholder="Enter your username"
                disabled={isUpdating}
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
              {!usernameError && username && !isCheckingUsername && (
                <div style={{ fontSize: "12px", color: "#4CAF50", marginTop: "4px" }}>
                  Username is available
                </div>
              )}
            </div>
            <div className="setting-item">
              <label>Avatar URL (optional)</label>
              <input
                type="url"
                value={photoURL}
                onChange={(e) => setPhotoURL(e.target.value)}
                placeholder="Enter avatar image URL"
                disabled={isUpdating}
              />
            </div>
          </div>
        </div>

        <div className="actions">
          <button
            onClick={handleComplete}
            disabled={isUpdating || !displayName.trim() || !username.trim() || !!usernameError || isCheckingUsername}
            className="save-btn"
          >
            {isUpdating ? "Saving..." : "Complete Setup"}
          </button>
        </div>
      </div>
    </div>
  );
}
