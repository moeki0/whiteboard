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
import { BoardSettings } from "./components/BoardSettings";
import { Layout } from "./components/Layout";
import { HeaderWrapper } from "./components/HeaderWrapper";
import { ProjectProvider } from "./contexts/ProjectContext";
import { User } from "./types";
import "./App.css";

function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUser(user as User | null);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // Protected Route Component
  function ProtectedRoute({ children }: { children: React.ReactNode }) {
    if (loading) {
      return <div className="loading"></div>;
    }

    if (!user) {
      return <Auth user={user} />;
    }

    return (
      <Layout>
        <HeaderWrapper user={user} />
        {children}
      </Layout>
    );
  }

  return (
    <div className="app">
      <ProjectProvider>
        <Router>
          <Routes>
            {/* Public Routes */}
            <Route
              path="/invite/:inviteCode"
              element={user ? <InviteJoin user={user} /> : <Auth user={null} />}
            />

            {/* Protected Routes */}
            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <Home user={user!} />
                </ProtectedRoute>
              }
            />

            <Route
              path="/project/:projectId"
              element={
                <ProtectedRoute>
                  <BoardList user={user!} />
                </ProtectedRoute>
              }
            />

            <Route
              path="/create-project"
              element={
                <ProtectedRoute>
                  <ProjectCreate user={user!} />
                </ProtectedRoute>
              }
            />

            <Route
              path="/project/:projectId/settings"
              element={
                <ProtectedRoute>
                  <ProjectSettings user={user!} />
                </ProtectedRoute>
              }
            />

            <Route
              path="/user/settings"
              element={
                <ProtectedRoute>
                  <UserSettings user={user!} />
                </ProtectedRoute>
              }
            />

            <Route
              path="/board/:boardId/settings"
              element={
                <ProtectedRoute>
                  <BoardSettings user={user!} />
                </ProtectedRoute>
              }
            />

            <Route
              path="/:boardId"
              element={
                loading ? (
                  <div className="loading"></div>
                ) : (
                  <Layout>
                    {user ? (
                      <HeaderWrapper user={user} />
                    ) : (
                      <div
                        style={{
                          background: "white",
                          padding: "10px 20px",
                          borderBottom: "1px solid #e0e0e0",
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          position: "fixed",
                          top: 0,
                          width: "100%"
                        }}
                      >
                        <h1 style={{ margin: 0, fontSize: "18px" }}>Maplap</h1>
                        <button
                          onClick={() => (window.location.href = "/")}
                          style={{
                            padding: "8px 16px",
                            background: "#007bff",
                            color: "white",
                            border: "none",
                            borderRadius: "4px",
                            cursor: "pointer",
                          }}
                        >
                          ログイン
                        </button>
                      </div>
                    )}
                    <Board user={user} />
                  </Layout>
                )
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
