import { useState, useEffect } from "react";
import { User } from "../types/user";
import { fetchCurrentUser, login as apiLogin } from "../api/auth";
import { getToken, removeToken } from "../api/api";

export function useAuth() {
  const [isAuthenticated, setIsAuthenticated] = useState(!!getToken());
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isAuthenticated) {
      fetchCurrentUser()
        .then(setCurrentUser)
        .catch(() => {
          removeToken();
          setIsAuthenticated(false);
        })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, [isAuthenticated]);

  async function login(username: string, password: string) {
    try {
      setError(null);
      await apiLogin(username, password);
      setIsAuthenticated(true);
    } catch (e: any) {
      setError(e.message || "Login failed");
      throw e;
    }
  }

  function logout() {
    removeToken();
    setIsAuthenticated(false);
    setCurrentUser(null);
  }

  return { isAuthenticated, currentUser, loading, error, login, logout };
}