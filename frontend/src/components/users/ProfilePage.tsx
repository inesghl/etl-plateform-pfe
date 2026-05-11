// src/components/users/ProfilePage.tsx
import React, { useState } from "react";
import { User } from "../../types/user";
import { useUsers } from "../../hooks/useUsers";
import styles from "../../styles/ProfilePage.module.css";

interface Props {
  currentUser: User;
  onProfileUpdated: (user: User) => void;
}

type Section = "info" | "password";

export function ProfilePage({ currentUser, onProfileUpdated }: Props) {
  const { updateProfile } = useUsers();

  const [section, setSection] = useState<Section>("info");
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  const [info, setInfo] = useState({
    first_name: currentUser.first_name || "",
    last_name: currentUser.last_name || "",
    email: currentUser.email || "",
  });
  const [infoSaving, setInfoSaving] = useState(false);
  const [infoErr, setInfoErr] = useState<string | null>(null);

  const [pwd, setPwd] = useState({
    current_password: "",
    new_password: "",
    confirm: "",
  });
  const [pwdSaving, setPwdSaving] = useState(false);
  const [pwdErr, setPwdErr] = useState<string | null>(null);

  function showToast(msg: string, ok = true) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3500);
  }

  async function handleInfoSave() {
    setInfoErr(null);
    setInfoSaving(true);
    try {
      const updated = await updateProfile({
        first_name: info.first_name,
        last_name: info.last_name,
        email: info.email,
      });
      // updated is the full User object returned by the server
      onProfileUpdated(updated);
      showToast("Profile updated successfully");
    } catch (e: any) {
      // apiFetch throws plain Error with message string — NOT axios-style e.response.data
      setInfoErr(e?.message || "Update failed");
    } finally {
      setInfoSaving(false);
    }
  }

  async function handlePasswordSave() {
    setPwdErr(null);
    if (pwd.new_password.length < 8) {
      setPwdErr("New password must be at least 8 characters.");
      return;
    }
    if (pwd.new_password !== pwd.confirm) {
      setPwdErr("Passwords do not match.");
      return;
    }
    setPwdSaving(true);
    try {
      await updateProfile({
        current_password: pwd.current_password,
        new_password: pwd.new_password,
      });
      setPwd({ current_password: "", new_password: "", confirm: "" });
      showToast("Password changed successfully");
    } catch (e: any) {
      setPwdErr(e?.message || "Failed to update password");
    } finally {
      setPwdSaving(false);
    }
  }

  const initials =
    `${currentUser.first_name?.[0] || ""}${currentUser.last_name?.[0] || ""}`
      .toUpperCase() || currentUser.username[0].toUpperCase();
  const fullName = [currentUser.first_name, currentUser.last_name]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={styles.container}>
      {toast && (
        <div
          className={`${styles.toast} ${
            toast.ok ? styles.toastOk : styles.toastErr
          }`}
        >
          {toast.msg}
        </div>
      )}

      {/* Profile card header */}
      <div className={styles.profileCard}>
        <div
          className={`${styles.avatar} ${
            currentUser.is_admin ? styles.avatarAdmin : ""
          }`}
        >
          {initials}
        </div>
        <div className={styles.profileInfo}>
          <div className={styles.profileName}>
            {fullName || currentUser.username}
          </div>
          <div className={styles.profileMeta}>
            <span
              className={`${styles.roleBadge} ${
                currentUser.is_admin ? styles.roleAdmin : styles.roleUser
              }`}
            >
              {currentUser.role}
            </span>
            <span className={styles.username}>@{currentUser.username}</span>
          </div>
          <div className={styles.profileEmail}>{currentUser.email}</div>
        </div>
      </div>

      {/* Section tabs */}
      <div className={styles.tabs}>
        <button
          className={`${styles.tab} ${
            section === "info" ? styles.tabActive : ""
          }`}
          onClick={() => setSection("info")}
        >
          Personal Info
        </button>
        <button
          className={`${styles.tab} ${
            section === "password" ? styles.tabActive : ""
          }`}
          onClick={() => setSection("password")}
        >
          Change Password
        </button>
      </div>

      {/* Info Section */}
      {section === "info" && (
        <div className={styles.section}>
          <h3 className={styles.sectionTitle}>Personal Information</h3>
          <p className={styles.sectionDesc}>
            Update your display name and email address.
          </p>

          {infoErr && <div className={styles.formError}>{infoErr}</div>}

          <div className={styles.fieldRow}>
            <div className={styles.field}>
              <label className={styles.label}>First Name</label>
              <input
                className={styles.input}
                value={info.first_name}
                onChange={(e) =>
                  setInfo((f) => ({ ...f, first_name: e.target.value }))
                }
                placeholder="First name"
              />
            </div>
            <div className={styles.field}>
              <label className={styles.label}>Last Name</label>
              <input
                className={styles.input}
                value={info.last_name}
                onChange={(e) =>
                  setInfo((f) => ({ ...f, last_name: e.target.value }))
                }
                placeholder="Last name"
              />
            </div>
          </div>

          <div className={styles.field}>
            <label className={styles.label}>Email</label>
            <input
              className={styles.input}
              type="email"
              value={info.email}
              onChange={(e) =>
                setInfo((f) => ({ ...f, email: e.target.value }))
              }
              placeholder="your@email.com"
            />
          </div>

          <div className={styles.fieldReadonly}>
            <label className={styles.label}>Username</label>
            <div className={styles.readonlyValue}>{currentUser.username}</div>
            <span className={styles.readonlyNote}>
              Username cannot be changed.
            </span>
          </div>

          <div className={styles.fieldReadonly}>
            <label className={styles.label}>Member since</label>
            <div className={styles.readonlyValue}>
              {new Date(currentUser.date_joined).toLocaleDateString(undefined, {
                year: "numeric",
                month: "long",
                day: "numeric",
              })}
            </div>
          </div>

          <button
            className={styles.btnPrimary}
            onClick={handleInfoSave}
            disabled={infoSaving}
          >
            {infoSaving ? "Saving…" : "Save Changes"}
          </button>
        </div>
      )}

      {/* Password Section */}
      {section === "password" && (
        <div className={styles.section}>
          <h3 className={styles.sectionTitle}>Change Password</h3>
          <p className={styles.sectionDesc}>
            Choose a strong password of at least 8 characters.
          </p>

          {pwdErr && <div className={styles.formError}>{pwdErr}</div>}

          <div className={styles.field}>
            <label className={styles.label}>Current Password</label>
            <input
              className={styles.input}
              type="password"
              value={pwd.current_password}
              onChange={(e) =>
                setPwd((p) => ({ ...p, current_password: e.target.value }))
              }
              placeholder="••••••••"
            />
          </div>
          <div className={styles.field}>
            <label className={styles.label}>New Password</label>
            <input
              className={styles.input}
              type="password"
              value={pwd.new_password}
              onChange={(e) =>
                setPwd((p) => ({ ...p, new_password: e.target.value }))
              }
              placeholder="••••••••"
            />
          </div>
          <div className={styles.field}>
            <label className={styles.label}>Confirm New Password</label>
            <input
              className={styles.input}
              type="password"
              value={pwd.confirm}
              onChange={(e) =>
                setPwd((p) => ({ ...p, confirm: e.target.value }))
              }
              placeholder="••••••••"
            />
          </div>

          <button
            className={styles.btnPrimary}
            onClick={handlePasswordSave}
            disabled={pwdSaving}
          >
            {pwdSaving ? "Updating…" : "Update Password"}
          </button>
        </div>
      )}
    </div>
  );
}