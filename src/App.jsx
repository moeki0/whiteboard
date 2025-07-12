import { useState, useEffect } from "react";
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
} from "react-router-dom";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "./config/firebase";
import { Auth } from "./components/Auth";
import { Home } from "./components/Home";
import { BoardList } from "./components/BoardList";
import { Board } from "./components/Board";
import { InviteJoin } from "./components/InviteJoin";
import { ProjectSettings } from "./components/ProjectSettings";
import { ProjectCreate } from "./components/ProjectCreate";
import { UserSettings } from "./components/UserSettings";
import { ProjectProvider } from "./contexts/ProjectContext";
import "./App.css";

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUser(user);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // Protected Route Component
  function ProtectedRoute({ children }) {
    if (loading) {
      return <div className="loading">Loading...</div>;
    }

    if (!user) {
      return <Auth />;
    }

    return children;
  }

  return (
    <div className="app">
      <ProjectProvider>
        <Router>
          <Routes>
            {/* Public Routes */}
            <Route
              path="/invite/:inviteCode"
              element={user ? <InviteJoin user={user} /> : <Auth />}
            />

            {/* Protected Routes */}
            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <Home user={user} />
                </ProtectedRoute>
              }
            />

            <Route
              path="/project/:projectId"
              element={
                <ProtectedRoute>
                  <BoardList user={user} />
                </ProtectedRoute>
              }
            />

            <Route
              path="/project/:projectId/board/:boardId"
              element={
                <ProtectedRoute>
                  <Board user={user} />
                </ProtectedRoute>
              }
            />

            <Route
              path="/create-project"
              element={
                <ProtectedRoute>
                  <ProjectCreate user={user} />
                </ProtectedRoute>
              }
            />

            <Route
              path="/project/:projectId/settings"
              element={
                <ProtectedRoute>
                  <ProjectSettings user={user} />
                </ProtectedRoute>
              }
            />

            <Route
              path="/user/settings"
              element={
                <ProtectedRoute>
                  <UserSettings user={user} />
                </ProtectedRoute>
              }
            />

            {/* Redirect unknown routes to home */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Router>
      </ProjectProvider>
    </div>
  );
}

export default App;
