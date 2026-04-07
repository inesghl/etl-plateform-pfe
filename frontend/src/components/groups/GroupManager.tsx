// components/groups/GroupManager.tsx
import React, { useEffect, useState } from "react";
import { UserGroup } from "../../types/group";
import { User } from "../../types/user";
import {
  fetchGroups, createGroup, updateGroup, deleteGroup,
  addGroupMembers, removeGroupMembers,
} from "../../api/groups";
import { apiFetch } from "../../api/api";

const T = {
  bg: "#ffffff", surface: "#f8fafc", border: "#e2e8f0",
  text: "#0f172a", textMid: "#475569", textMuted: "#94a3b8",
  accent: "#2563eb", accentBg: "#eff6ff", accentBorder: "#93c5fd",
  success: "#16a34a", successBg: "#f0fdf4",
  danger: "#dc2626", dangerBg: "#fef2f2", dangerBorder: "#fca5a5",
  r: "8px", mono: "monospace",
};

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "7px 10px", borderRadius: T.r,
  border: `1px solid ${T.border}`, background: T.surface,
  color: T.text, fontSize: 13, boxSizing: "border-box", outline: "none",
};

export function GroupManager() {
  const [groups, setGroups] = useState<UserGroup[]>([]);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeGroup, setActiveGroup] = useState<UserGroup | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([fetchGroups(), apiFetch("/users/")])
      .then(([gs, us]) => {
        setGroups(gs);
        setAllUsers(Array.isArray(us) ? us : us?.results ?? []);
      })
      .catch(e => setErr(e.message))
      .finally(() => setLoading(false));
  }, []);

  async function refresh() {
    const gs = await fetchGroups();
    setGroups(gs);
    if (activeGroup) {
      const updated = gs.find(g => g.id === activeGroup.id);
      setActiveGroup(updated ?? null);
    }
  }

  if (loading) return <div style={{ padding: 24, color: T.textMuted }}>Loading groups…</div>;

  return (
    <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
      {/* Left: group list */}
      <div style={{ width: 260, flexShrink: 0 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: T.textMid }}>
            Groups ({groups.length})
          </span>
          <button
            onClick={() => { setShowCreate(true); setActiveGroup(null); }}
            style={{
              padding: "4px 10px", borderRadius: T.r, fontSize: 12,
              border: `1px solid ${T.accent}`, background: T.accentBg,
              color: T.accent, cursor: "pointer", fontWeight: 600,
            }}
          >
            + New group
          </button>
        </div>

        {groups.length === 0 && (
          <div style={{ fontSize: 13, color: T.textMuted, padding: "12px 0" }}>
            No groups yet. Create one to restrict ETL access.
          </div>
        )}

        {groups.map(g => (
          <div
            key={g.id}
            onClick={() => { setActiveGroup(g); setShowCreate(false); }}
            style={{
              padding: "10px 12px", borderRadius: T.r, marginBottom: 6, cursor: "pointer",
              border: `1px solid ${activeGroup?.id === g.id ? T.accent : T.border}`,
              background: activeGroup?.id === g.id ? T.accentBg : "#fff",
              transition: "all .12s",
            }}
          >
            <div style={{ fontSize: 13, fontWeight: 600, color: T.text }}>{g.name}</div>
            <div style={{ fontSize: 11, color: T.textMuted, marginTop: 2 }}>
              {g.member_count} member{g.member_count !== 1 ? "s" : ""}
            </div>
          </div>
        ))}
      </div>

      {/* Right: detail / create */}
      <div style={{ flex: 1 }}>
        {err && (
          <div style={{ padding: "10px 14px", borderRadius: T.r, background: T.dangerBg,
            border: `1px solid ${T.dangerBorder}`, color: T.danger, fontSize: 13, marginBottom: 12 }}>
            {err}
          </div>
        )}

        {showCreate && (
          <CreateGroupForm
            allUsers={allUsers}
            onCreated={async (g) => {
              await refresh();
              setShowCreate(false);
              setActiveGroup(g);
            }}
            onCancel={() => setShowCreate(false)}
          />
        )}

        {!showCreate && activeGroup && (
          <GroupDetail
            group={activeGroup}
            allUsers={allUsers}
            onUpdated={refresh}
            onDeleted={async () => { await refresh(); setActiveGroup(null); }}
          />
        )}

        {!showCreate && !activeGroup && (
          <div style={{
            padding: 32, textAlign: "center", color: T.textMuted,
            fontSize: 13, border: `1px dashed ${T.border}`, borderRadius: T.r,
          }}>
            Select a group to manage its members, or create a new one.
          </div>
        )}
      </div>
    </div>
  );
}

// ── CreateGroupForm ───────────────────────────────────────────────

function CreateGroupForm({
  allUsers, onCreated, onCancel,
}: {
  allUsers: User[];
  onCreated: (g: UserGroup) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function handleCreate() {
    if (!name.trim()) return;
    try {
      setBusy(true); setErr(null);
      const g = await createGroup({
        name: name.trim(),
        description: description.trim(),
        member_ids: [...selectedIds],
      });
      onCreated(g);
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ padding: 16, borderRadius: T.r, border: `1px solid ${T.border}`, background: "#fff" }}>
      <div style={{ fontSize: 14, fontWeight: 700, color: T.text, marginBottom: 14 }}>Create group</div>

      <div style={{ marginBottom: 10 }}>
        <label style={{ fontSize: 12, fontWeight: 600, color: T.textMid, display: "block", marginBottom: 4 }}>
          Group name *
        </label>
        <input value={name} onChange={e => setName(e.target.value)} style={inputStyle} placeholder="e.g. Data Team" />
      </div>

      <div style={{ marginBottom: 14 }}>
        <label style={{ fontSize: 12, fontWeight: 600, color: T.textMid, display: "block", marginBottom: 4 }}>
          Description
        </label>
        <input value={description} onChange={e => setDescription(e.target.value)}
          style={inputStyle} placeholder="Optional description" />
      </div>

      <div style={{ marginBottom: 16 }}>
        <label style={{ fontSize: 12, fontWeight: 600, color: T.textMid, display: "block", marginBottom: 6 }}>
          Members ({selectedIds.size} selected)
        </label>
        <UserPicker allUsers={allUsers} selectedIds={selectedIds} onChange={setSelectedIds} />
      </div>

      {err && <div style={{ fontSize: 12, color: T.danger, marginBottom: 10 }}>{err}</div>}

      <div style={{ display: "flex", gap: 8 }}>
        <button
          onClick={handleCreate} disabled={busy || !name.trim()}
          style={{
            padding: "7px 16px", borderRadius: T.r, fontSize: 13, cursor: "pointer",
            border: "none", background: T.accent, color: "#fff", fontWeight: 600,
            opacity: busy || !name.trim() ? 0.6 : 1,
          }}
        >
          {busy ? "Creating…" : "Create group"}
        </button>
        <button
          onClick={onCancel}
          style={{
            padding: "7px 14px", borderRadius: T.r, fontSize: 13, cursor: "pointer",
            border: `1px solid ${T.border}`, background: "transparent", color: T.textMid,
          }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

// ── GroupDetail ───────────────────────────────────────────────────

function GroupDetail({
  group, allUsers, onUpdated, onDeleted,
}: {
  group: UserGroup;
  allUsers: User[];
  onUpdated: () => void;
  onDeleted: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(group.name);
  const [description, setDescription] = useState(group.description);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const memberIds = new Set(group.members.map(m => m.id));
  const nonMembers = allUsers.filter(u => !memberIds.has(u.id) && !u.is_admin);

  async function saveEdit() {
    try {
      setBusy(true); setErr(null);
      await updateGroup(group.id, { name: name.trim(), description: description.trim() });
      setEditing(false);
      onUpdated();
    } catch (e: any) { setErr(e.message); }
    finally { setBusy(false); }
  }

  async function handleAddMember(userId: number) {
    try {
      await addGroupMembers(group.id, [userId]);
      onUpdated();
    } catch (e: any) { setErr((e as any).message); }
  }

  async function handleRemoveMember(userId: number) {
    try {
      await removeGroupMembers(group.id, [userId]);
      onUpdated();
    } catch (e: any) { setErr((e as any).message); }
  }

  async function handleDelete() {
    if (!confirm(`Delete group "${group.name}"? ETLs assigned to this group will become unrestricted.`)) return;
    try {
      await deleteGroup(group.id);
      onDeleted();
    } catch (e: any) { setErr((e as any).message); }
  }

  return (
    <div style={{ padding: 16, borderRadius: T.r, border: `1px solid ${T.border}`, background: "#fff" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
        <div>
          {editing ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <input value={name} onChange={e => setName(e.target.value)} style={{ ...inputStyle, fontSize: 14, fontWeight: 600 }} />
              <input value={description} onChange={e => setDescription(e.target.value)} style={inputStyle} placeholder="Description" />
              <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
                <button onClick={saveEdit} disabled={busy} style={{
                  padding: "5px 12px", borderRadius: T.r, fontSize: 12,
                  border: "none", background: T.accent, color: "#fff", cursor: "pointer",
                }}>
                  {busy ? "Saving…" : "Save"}
                </button>
                <button onClick={() => setEditing(false)} style={{
                  padding: "5px 10px", borderRadius: T.r, fontSize: 12,
                  border: `1px solid ${T.border}`, background: "transparent", color: T.textMid, cursor: "pointer",
                }}>
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <>
              <div style={{ fontSize: 15, fontWeight: 700, color: T.text }}>{group.name}</div>
              {group.description && (
                <div style={{ fontSize: 12, color: T.textMuted, marginTop: 2 }}>{group.description}</div>
              )}
            </>
          )}
        </div>
        {!editing && (
          <div style={{ display: "flex", gap: 6 }}>
            <button onClick={() => setEditing(true)} style={{
              padding: "5px 10px", borderRadius: T.r, fontSize: 12,
              border: `1px solid ${T.border}`, background: "transparent", color: T.textMid, cursor: "pointer",
            }}>
              Edit
            </button>
            <button onClick={handleDelete} style={{
              padding: "5px 10px", borderRadius: T.r, fontSize: 12,
              border: `1px solid ${T.dangerBorder}`, background: T.dangerBg,
              color: T.danger, cursor: "pointer",
            }}>
              Delete
            </button>
          </div>
        )}
      </div>

      {err && <div style={{ fontSize: 12, color: T.danger, marginBottom: 10 }}>{err}</div>}

      {/* Current members */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: T.textMid, marginBottom: 8, textTransform: "uppercase", letterSpacing: ".05em" }}>
          Members ({group.members.length})
        </div>
        {group.members.length === 0 ? (
          <div style={{ fontSize: 12, color: T.textMuted }}>No members yet.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {group.members.map(m => (
              <div key={m.id} style={{
                display: "flex", justifyContent: "space-between", alignItems: "center",
                padding: "6px 10px", borderRadius: T.r, background: T.surface, border: `1px solid ${T.border}`,
              }}>
                <div>
                  <span style={{ fontSize: 13, fontWeight: 500, color: T.text }}>{m.username}</span>
                  {m.email && <span style={{ fontSize: 11, color: T.textMuted, marginLeft: 8 }}>{m.email}</span>}
                </div>
                <button
                  onClick={() => handleRemoveMember(m.id)}
                  style={{
                    fontSize: 11, padding: "2px 8px", borderRadius: 6,
                    border: `1px solid ${T.dangerBorder}`, background: "#fff",
                    color: T.danger, cursor: "pointer",
                  }}
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add members */}
      {nonMembers.length > 0 && (
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: T.textMid, marginBottom: 8, textTransform: "uppercase", letterSpacing: ".05em" }}>
            Add members
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 200, overflowY: "auto" }}>
            {nonMembers.map(u => (
              <div key={u.id} style={{
                display: "flex", justifyContent: "space-between", alignItems: "center",
                padding: "6px 10px", borderRadius: T.r, background: "#fff", border: `1px solid ${T.border}`,
              }}>
                <div>
                  <span style={{ fontSize: 13, color: T.text }}>{u.username}</span>
                  {u.email && <span style={{ fontSize: 11, color: T.textMuted, marginLeft: 8 }}>{u.email}</span>}
                </div>
                <button
                  onClick={() => handleAddMember(u.id)}
                  style={{
                    fontSize: 11, padding: "2px 8px", borderRadius: 6,
                    border: `1px solid ${T.accentBorder}`, background: T.accentBg,
                    color: T.accent, cursor: "pointer",
                  }}
                >
                  + Add
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── UserPicker (multi-select for create form) ─────────────────────

function UserPicker({
  allUsers, selectedIds, onChange,
}: {
  allUsers: User[];
  selectedIds: Set<number>;
  onChange: (ids: Set<number>) => void;
}) {
  const [search, setSearch] = useState("");
  const filtered = allUsers.filter(u =>
    !u.is_admin &&
    (u.username.toLowerCase().includes(search.toLowerCase()) ||
     (u.email ?? "").toLowerCase().includes(search.toLowerCase()))
  );

  function toggle(id: number) {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange(next);
  }

  return (
    <div>
      <input
        value={search} onChange={e => setSearch(e.target.value)}
        style={{ ...inputStyle, marginBottom: 6 }}
        placeholder="Search users…"
      />
      <div style={{ maxHeight: 180, overflowY: "auto", display: "flex", flexDirection: "column", gap: 3 }}>
        {filtered.map(u => (
          <label key={u.id} style={{
            display: "flex", alignItems: "center", gap: 8, padding: "5px 8px",
            borderRadius: 6, cursor: "pointer",
            background: selectedIds.has(u.id) ? T.accentBg : "#fff",
            border: `1px solid ${selectedIds.has(u.id) ? T.accentBorder : T.border}`,
          }}>
            <input
              type="checkbox" checked={selectedIds.has(u.id)}
              onChange={() => toggle(u.id)} style={{ margin: 0 }}
            />
            <span style={{ fontSize: 12, color: T.text }}>{u.username}</span>
            {u.email && <span style={{ fontSize: 11, color: T.textMuted }}>{u.email}</span>}
          </label>
        ))}
        {filtered.length === 0 && (
          <div style={{ fontSize: 12, color: T.textMuted, padding: "8px 0" }}>No users found.</div>
        )}
      </div>
    </div>
  );
}