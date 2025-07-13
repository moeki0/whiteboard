import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { auth } from "../config/firebase";
import { signOut } from "firebase/auth";
import { Header } from "./Header";
import { User } from "../types";
import "./UserSettings.css";

interface UserSettingsProps {
  user: User;
}

export function UserSettings({ user }: UserSettingsProps) {
  const navigate = useNavigate();
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const handleLogout = async () => {
    if (!window.confirm("Are you sure you want to logout?")) {
      return;
    }

    setIsLoggingOut(true);
    try {
      await signOut(auth);
      // Auth state change will automatically redirect to login
    } catch (error) {
      console.error("Error signing out:", error);
      alert("Failed to logout. Please try again.");
      setIsLoggingOut(false);
    }
  };

  return (
    <div className="user-settings">
      <Header title="User Settings" user={user} />

      <div className="settings-container">
        {/* User Information */}
        <div className="settings-section">
          <div className="user-profile">
            <div className="user-avatar">
              {user.photoURL ? (
                <img
                  src={user.photoURL}
                  alt="Profile"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="avatar-placeholder">
                  {(user.displayName || user.email || "U")
                    .charAt(0)
                    .toUpperCase()}
                </div>
              )}
            </div>
            <div className="user-details">
              <div className="setting-item">
                <label>Display Name</label>
                <span>{user.displayName || "Not set"}</span>
              </div>
              <div className="setting-item">
                <label>Email</label>
                <span>{user.email}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Session */}
        <div className="settings-section danger-zone">
          <div className="setting-item">
            <button
              onClick={handleLogout}
              disabled={isLoggingOut}
              className="logout-btn"
            >
              {isLoggingOut ? "Logging out..." : "Logout"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
