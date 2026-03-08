import React from "react";
import { useAuth } from "./hooks/useAuth";
import { LoginPage } from "./pages/LoginPage";
import { Dashboard } from "./pages/Dashboard";

export default function App() {
  const { isAuthenticated, currentUser, error, login, logout } = useAuth();

  if (!isAuthenticated || !currentUser) {
    return <LoginPage onLogin={login} error={error} />;
  }

  return <Dashboard currentUser={currentUser} onLogout={logout} />;
}