import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { auth } from "../config/firebase";
import { signOut, deleteUser } from "firebase/auth";
import { User } from "../types";
import "./UserSettings.css";

interface UserSettingsProps {
  user: User;
}

export function UserSettings({ user }: UserSettingsProps) {
  const navigate = useNavigate();
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);

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

  return (
    <div className="user-settings">
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
