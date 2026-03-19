import React from "react";
import { useAuth } from "./hooks/useAuth";
import { LoginPage } from "./pages/LoginPage";
import Dashboard from "./pages/Dashboard";

function App() {
  const { isAuthenticated, currentUser, loading, error, login, logout } = useAuth();

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <span>Loading…</span>
      </div>
    );
  }

  if (!isAuthenticated || !currentUser) {
    return <LoginPage onLogin={login} error={error} />;
  }

  return <Dashboard currentUser={currentUser} onLogout={logout} />;
}

export default App;