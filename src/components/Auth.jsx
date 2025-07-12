import { useState } from "react";
import { signOut, GoogleAuthProvider, signInWithPopup } from "firebase/auth";
import { auth } from "../config/firebase";

export function Auth({ user }) {
  const [error, setError] = useState("");

  const handleGoogleSignIn = async () => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut(auth);
    } catch (err) {
      setError(err.message);
    }
  };

  if (user) {
    return (
      <div className="auth-container">
        <p>Welcome, {user.displayName || user.email}!</p>
        <button onClick={handleSignOut}>Sign Out</button>
      </div>
    );
  }

  return (
    <div className="auth-container">
      <h2>Welcome to Maplap</h2>
      <p>Collaborative Sticky Notes</p>

      <button onClick={handleGoogleSignIn} className="google-signin">
        Sign in with Google
      </button>

      {error && <p className="error">{error}</p>}
    </div>
  );
}
