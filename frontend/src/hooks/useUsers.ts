// src/hooks/useUsers.ts
import { useState, useCallback } from "react";
import { User } from "../types/user";
import {
  fetchUsers,
  createUser,
  updateUser,
  deleteUser,
  toggleUserActive,
  setUserRole,
  adminSetPassword,
  updateMyProfile,
  ProfileUpdatePayload,
  AdminUserUpdatePayload,
} from "../api/users";

export function useUsers() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchUsers();
      setUsers(data);
    } catch (e: any) {
      setError(e?.response?.data?.detail || "Failed to load users");
    } finally {
      setLoading(false);
    }
  }, []);

  const create = useCallback(
    async (data: {
      username: string;
      email: string;
      password: string;
      role: "admin" | "user";
    }) => {
      const user = await createUser(data);
      setUsers((prev) => [...prev, user]);
      return user;
    },
    []
  );
const update = useCallback(async (id: number, data: AdminUserUpdatePayload) => {
  const user = await updateUser(id, data);
  setUsers((prev) => prev.map((u) => (Number(u.id) === Number(id) ? user : u)));
  return user;
}, []);

const toggleActive = useCallback(async (id: number) => {
  const user = await toggleUserActive(id);
  setUsers((prev) => prev.map((u) => (Number(u.id) === Number(id) ? user : u)));
  return user;
}, []);

const changeRole = useCallback(async (id: number, role: "admin" | "user") => {
  const user = await setUserRole(id, role);
  setUsers((prev) => prev.map((u) => (Number(u.id) === Number(id) ? user : u)));
  return user;
}, []);

const remove = useCallback(async (id: number) => {
  await deleteUser(id);
  setUsers((prev) => prev.filter((u) => Number(u.id) !== Number(id)));
}, []);

  const resetPassword = useCallback(async (id: number, password: string) => {
    await adminSetPassword(id, password);
  }, []);

  const updateProfile = useCallback(async (data: ProfileUpdatePayload): Promise<User> => {
    return await updateMyProfile(data);
  }, []);

  return {
    users,
    loading,
    error,
    loadUsers,
    create,
    update,
    remove,
    toggleActive,
    changeRole,
    resetPassword,
    updateProfile,
  };
}