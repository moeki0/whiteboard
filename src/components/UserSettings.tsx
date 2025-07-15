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
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

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

  const handleDeleteAccount = async () => {
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
        alert("For security reasons, please logout and login again before deleting your account.");
      } else {
        alert("Failed to delete account. Please try again.");
      }
      
      setIsDeletingAccount(false);
      setShowDeleteConfirm(false);
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

        {/* Account Deletion */}
        <div className="settings-section danger-zone">
          <h3>Danger Zone</h3>
          <div className="setting-item">
            <div className="danger-warning">
              <p>Once you delete your account, there is no going back. Please be certain.</p>
            </div>
            <button
              onClick={() => setShowDeleteConfirm(true)}
              disabled={isDeletingAccount}
              className="delete-account-btn"
            >
              Delete Account
            </button>
          </div>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h3>Delete Account</h3>
            <p>
              Are you absolutely sure you want to delete your account? This action cannot be undone.
            </p>
            <p>
              <strong>This will permanently delete:</strong>
            </p>
            <ul>
              <li>Your account and profile information</li>
              <li>All projects you own</li>
              <li>All boards and notes you created</li>
              <li>Your access to shared projects</li>
            </ul>
            <div className="modal-actions">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                disabled={isDeletingAccount}
                className="cancel-btn"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteAccount}
                disabled={isDeletingAccount}
                className="confirm-delete-btn"
              >
                {isDeletingAccount ? "Deleting..." : "Yes, Delete My Account"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
