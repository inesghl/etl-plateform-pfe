// src/components/users/UserPage.tsx
import React, { useEffect, useState } from "react";
import { User } from "../../types/user";
import { useUsers } from "../../hooks/useUsers";
import styles from "../../styles/UserPage.module.css";

interface Props {
  currentUser: User;
}

type Modal =
  | { kind: "create" }
  | { kind: "edit"; user: User }
  | { kind: "password"; user: User }
  | { kind: "delete"; user: User }
  | null;

export function UsersPage({ currentUser }: Props) {
  const {
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
  } = useUsers();

  const [modal, setModal] = useState<Modal>(null);
  const [search, setSearch] = useState("");
  const [filterRole, setFilterRole] = useState<"all" | "admin" | "user">("all");
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }

  const filtered = users.filter((u) => {
    const matchSearch =
      u.username.toLowerCase().includes(search.toLowerCase()) ||
      (u.email || "").toLowerCase().includes(search.toLowerCase()) ||
      `${u.first_name} ${u.last_name}`
        .toLowerCase()
        .includes(search.toLowerCase());
    const matchRole = filterRole === "all" || u.role === filterRole;
    return matchSearch && matchRole;
  });

  return (
    <div className={styles.container}>
      {toast && <div className={styles.toast}>{toast}</div>}

      <div className={styles.header}>
        <div>
          <h2 className={styles.title}>User Management</h2>
          <p className={styles.subtitle}>{users.length} registered users</p>
        </div>
        <button
          className={styles.btnPrimary}
          onClick={() => setModal({ kind: "create" })}
        >
          + New User
        </button>
      </div>

      <div className={styles.filters}>
        <input
          className={styles.search}
          placeholder="Search users…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className={styles.roleFilter}>
          {(["all", "admin", "user"] as const).map((r) => (
            <button
              key={r}
              className={`${styles.roleBtn} ${
                filterRole === r ? styles.roleBtnActive : ""
              }`}
              onClick={() => setFilterRole(r)}
            >
              {r === "all" ? "All" : r.charAt(0).toUpperCase() + r.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {error && <div className={styles.error}>{error}</div>}

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>User</th>
              <th>Email</th>
              <th>Role</th>
              <th>Status</th>
              <th>Joined</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} className={styles.loading}>
                  Loading…
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className={styles.empty}>
                  No users found
                </td>
              </tr>
            ) : (
              filtered.map((user) => {
                // Safe id comparison — coerce both sides to string
                const isSelf =
                  user.id != null &&
                  currentUser.id != null &&
                  String(user.id) === String(currentUser.id);

                return (
                  <UserRow
                    key={String(user.id)}
                    user={user}
                    isSelf={isSelf}
                    onEdit={() => setModal({ kind: "edit", user })}
                    onPassword={() => setModal({ kind: "password", user })}
                    onDelete={() => setModal({ kind: "delete", user })}
                    onToggleActive={async () => {
                      try {
                        await toggleActive(user.id);
                        showToast(
                          `${user.username} ${
                            user.is_active ? "deactivated" : "activated"
                          }`
                        );
                      } catch (e: any) {
                        showToast(e?.message || "Action failed");
                      }
                    }}
                    onChangeRole={async (role) => {
                      try {
                        await changeRole(user.id, role);
                        showToast(`${user.username} is now ${role}`);
                      } catch (e: any) {
                        showToast(e?.message || "Action failed");
                      }
                    }}
                  />
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {modal?.kind === "create" && (
        <CreateUserModal
          onClose={() => setModal(null)}
          onCreate={async (data) => {
            await create(data);
            setModal(null);
            showToast("User created successfully");
          }}
        />
      )}

      {modal?.kind === "edit" && (
        <EditUserModal
          user={modal.user}
          onClose={() => setModal(null)}
          onSave={async (data) => {
            await update(modal.user.id, data);
            setModal(null);
            showToast("User updated");
          }}
        />
      )}

      {modal?.kind === "password" && (
        <PasswordModal
          user={modal.user}
          onClose={() => setModal(null)}
          onSave={async (pwd) => {
            await resetPassword(modal.user.id, pwd);
            setModal(null);
            showToast("Password updated");
          }}
        />
      )}

      {modal?.kind === "delete" && (
        <DeleteModal
          user={modal.user}
          onClose={() => setModal(null)}
          onConfirm={async () => {
            await remove(modal.user.id);
            setModal(null);
            showToast("User deleted");
          }}
        />
      )}
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function UserRow({
  user,
  isSelf,
  onEdit,
  onPassword,
  onDelete,
  onToggleActive,
  onChangeRole,
}: {
  user: User;
  isSelf: boolean;
  onEdit: () => void;
  onPassword: () => void;
  onDelete: () => void;
  onToggleActive: () => void;
  onChangeRole: (role: "admin" | "user") => void;
}) {
  const initials =
    `${user.first_name?.[0] || ""}${user.last_name?.[0] || ""}`
      .toUpperCase() || user.username[0].toUpperCase();
  const fullName = [user.first_name, user.last_name]
    .filter(Boolean)
    .join(" ");

  return (
    <tr className={!user.is_active ? styles.rowInactive : ""}>
      <td>
        <div className={styles.userCell}>
          <div
            className={`${styles.avatar} ${
              user.is_admin ? styles.avatarAdmin : ""
            }`}
          >
            {initials}
          </div>
          <div>
            <div className={styles.username}>
              {user.username}
              {isSelf && <span className={styles.youBadge}>You</span>}
            </div>
            {fullName && <div className={styles.fullName}>{fullName}</div>}
          </div>
        </div>
      </td>
      <td className={styles.email}>{user.email || "—"}</td>
      <td>
        {isSelf ? (
          // Can't change your own role from this table
          <span
            className={`${styles.badge} ${
              user.role === "admin" ? styles.badgeAdmin : styles.badgeUser
            }`}
          >
            {user.role}
          </span>
        ) : (
          <select
            className={styles.roleSelect}
            value={user.role}
            onChange={(e) =>
              onChangeRole(e.target.value as "admin" | "user")
            }
          >
            <option value="user">User</option>
            <option value="admin">Admin</option>
          </select>
        )}
      </td>
      <td>
        <span
          className={`${styles.statusDot} ${
            user.is_active ? styles.statusActive : styles.statusInactive
          }`}
        >
          {user.is_active ? "Active" : "Inactive"}
        </span>
      </td>
      <td className={styles.date}>
        {new Date(user.date_joined).toLocaleDateString()}
      </td>
      <td>
        <div className={styles.actions}>
          {isSelf ? (
            // Logged-in user: no actions here, they use My Profile tab
            <span className={styles.readonlyNote}> </span>
          ) : (
            <>
              <button
                className={styles.actionBtn}
                onClick={onEdit}
                title="Edit"
              >
                ✎
              </button>
              <button
                className={styles.actionBtn}
                onClick={onPassword}
                title="Reset password"
              >
                🔑
              </button>
              <button
                className={`${styles.actionBtn} ${
                  user.is_active
                    ? styles.actionDeactivate
                    : styles.actionActivate
                }`}
                onClick={onToggleActive}
                title={user.is_active ? "Deactivate" : "Activate"}
              >
                {user.is_active ? "⊘" : "✓"}
              </button>
              <button
                className={`${styles.actionBtn} ${styles.actionDelete}`}
                onClick={onDelete}
                title="Delete"
              >
                ✕
              </button>
            </>
          )}
        </div>
      </td>
    </tr>
  );
}

function CreateUserModal({
  onClose,
  onCreate,
}: {
  onClose: () => void;
  onCreate: (data: {
    username: string;
    email: string;
    password: string;
    role: "admin" | "user";
  }) => void;
}) {
  const [form, setForm] = useState({
    username: "",
    email: "",
    password: "",
    role: "user" as "admin" | "user",
  });
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit() {
    if (!form.username || !form.password) {
      setErr("Username and password are required.");
      return;
    }
    setSaving(true);
    try {
      await onCreate(form);
    } catch (e: any) {
      setErr(e?.message || "Error creating user");
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalShell title="Create User" onClose={onClose}>
      {err && <div className={styles.formError}>{err}</div>}
      <label className={styles.label}>Username *</label>
      <input
        className={styles.input}
        value={form.username}
        onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
      />
      <label className={styles.label}>Email</label>
      <input
        className={styles.input}
        type="email"
        value={form.email}
        onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
      />
      <label className={styles.label}>Password *</label>
      <input
        className={styles.input}
        type="password"
        value={form.password}
        onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
      />
      <label className={styles.label}>Role</label>
      <select
        className={styles.input}
        value={form.role}
        onChange={(e) =>
          setForm((f) => ({ ...f, role: e.target.value as "admin" | "user" }))
        }
      >
        <option value="user">User</option>
        <option value="admin">Admin</option>
      </select>
      <div className={styles.modalActions}>
        <button className={styles.btnSecondary} onClick={onClose}>
          Cancel
        </button>
        <button
          className={styles.btnPrimary}
          onClick={handleSubmit}
          disabled={saving}
        >
          {saving ? "Creating…" : "Create User"}
        </button>
      </div>
    </ModalShell>
  );
}

function EditUserModal({
  user,
  onClose,
  onSave,
}: {
  user: User;
  onClose: () => void;
  onSave: (data: any) => void;
}) {
  const [form, setForm] = useState({
    username: user.username,
    email: user.email,
    first_name: user.first_name,
    last_name: user.last_name,
  });
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit() {
    setSaving(true);
    try {
      await onSave(form);
    } catch (e: any) {
      setErr(e?.message || "Update failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalShell title={`Edit ${user.username}`} onClose={onClose}>
      {err && <div className={styles.formError}>{err}</div>}
      <label className={styles.label}>Username</label>
      <input
        className={styles.input}
        value={form.username}
        onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
      />
      <label className={styles.label}>First Name</label>
      <input
        className={styles.input}
        value={form.first_name}
        onChange={(e) =>
          setForm((f) => ({ ...f, first_name: e.target.value }))
        }
      />
      <label className={styles.label}>Last Name</label>
      <input
        className={styles.input}
        value={form.last_name}
        onChange={(e) => setForm((f) => ({ ...f, last_name: e.target.value }))}
      />
      <label className={styles.label}>Email</label>
      <input
        className={styles.input}
        type="email"
        value={form.email}
        onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
      />
      <div className={styles.modalActions}>
        <button className={styles.btnSecondary} onClick={onClose}>
          Cancel
        </button>
        <button
          className={styles.btnPrimary}
          onClick={handleSubmit}
          disabled={saving}
        >
          {saving ? "Saving…" : "Save Changes"}
        </button>
      </div>
    </ModalShell>
  );
}

function PasswordModal({
  user,
  onClose,
  onSave,
}: {
  user: User;
  onClose: () => void;
  onSave: (password: string) => void;
}) {
  const [pwd, setPwd] = useState("");
  const [confirm, setConfirm] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit() {
    if (pwd.length < 8) {
      setErr("Password must be at least 8 characters.");
      return;
    }
    if (pwd !== confirm) {
      setErr("Passwords do not match.");
      return;
    }
    setSaving(true);
    try {
      await onSave(pwd);
    } catch (e: any) {
      setErr(e?.message || "Failed to update password.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalShell title={`Reset password — ${user.username}`} onClose={onClose}>
      {err && <div className={styles.formError}>{err}</div>}
      <label className={styles.label}>New Password</label>
      <input
        className={styles.input}
        type="password"
        value={pwd}
        onChange={(e) => setPwd(e.target.value)}
      />
      <label className={styles.label}>Confirm Password</label>
      <input
        className={styles.input}
        type="password"
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
      />
      <div className={styles.modalActions}>
        <button className={styles.btnSecondary} onClick={onClose}>
          Cancel
        </button>
        <button
          className={styles.btnPrimary}
          onClick={handleSubmit}
          disabled={saving}
        >
          {saving ? "Updating…" : "Update Password"}
        </button>
      </div>
    </ModalShell>
  );
}

function DeleteModal({
  user,
  onClose,
  onConfirm,
}: {
  user: User;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const [saving, setSaving] = useState(false);
  return (
    <ModalShell title="Delete User" onClose={onClose}>
      <p className={styles.deleteWarning}>
        Are you sure you want to delete <strong>{user.username}</strong>? This
        cannot be undone.
      </p>
      <div className={styles.modalActions}>
        <button className={styles.btnSecondary} onClick={onClose}>
          Cancel
        </button>
        <button
          className={styles.btnDanger}
          disabled={saving}
          onClick={async () => {
            setSaving(true);
            await onConfirm();
          }}
        >
          {saving ? "Deleting…" : "Delete User"}
        </button>
      </div>
    </ModalShell>
  );
}

function ModalShell({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className={styles.overlay}>
      <div className={styles.modal}>
        <div className={styles.modalHead}>
          <span className={styles.modalTitle}>{title}</span>
          <button className={styles.modalClose} onClick={onClose}>
            ×
          </button>
        </div>
        <div className={styles.modalBody}>{children}</div>
      </div>
    </div>
  );
}