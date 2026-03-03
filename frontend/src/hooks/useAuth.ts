import { useState, useEffect } from "react";
import { fetchCurrentUser, getToken, login as apiLogin } from "../api/api";
import { User } from "../types/user";

export function useAuth() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(!!getToken());
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isAuthenticated) initAfterLogin();
  }, [isAuthenticated]);

  async function initAfterLogin() {
    try {
      setError(null);
      const user = await fetchCurrentUser();
      setCurrentUser(user);
    } catch (err) {
      console.error(err);
      setError("Could not load user information.");
    }
  }

  async function login(username: string, password: string) {
    try {
      setError(null);
      await apiLogin(username, password);
      setIsAuthenticated(true);
    } catch (err) {
      setError("Login failed. Check your credentials.");
      throw err;
    }
  }

  function logout() {
    localStorage.removeItem("access_token");
    setIsAuthenticated(false);
    setCurrentUser(null);
  }

  return { isAuthenticated, currentUser, error, login, logout };
}
