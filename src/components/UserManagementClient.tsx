"use client";

import { useState, useCallback } from "react";
import type { Role } from "@/lib/types";

type UserRow = {
  id: string;
  email: string;
  full_name: string;
  role: Role;
  is_active: boolean;
  created_at: string;
};

type Props = {
  users: UserRow[];
  currentUserId: string;
};

type Modal =
  | { type: "add" }
  | { type: "edit"; user: UserRow }
  | { type: "password"; user: UserRow }
  | null;

function roleLabel(role: Role) {
  if (role === "manager") return "Manager";
  if (role === "supervisor") return "Supervisor";
  return "Sales";
}

function roleBadgeClass(role: Role) {
  if (role === "manager") return "chip accent";
  if (role === "supervisor") return "chip warning";
  return "chip";
}

export function UserManagementClient({ users: initialUsers, currentUserId }: Props) {
  const [users, setUsers] = useState<UserRow[]>(initialUsers);
  const [modal, setModal] = useState<Modal>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Add user form state
  const [addEmail, setAddEmail] = useState("");
  const [addName, setAddName] = useState("");
  const [addRole, setAddRole] = useState<Role>("sales");
  const [addPassword, setAddPassword] = useState("");

  // Edit user form state
  const [editName, setEditName] = useState("");
  const [editRole, setEditRole] = useState<Role>("sales");

  // Change password form state
  const [newPassword, setNewPassword] = useState("");

  const closeModal = useCallback(() => {
    setModal(null);
    setError(null);
    setSuccess(null);
    setAddEmail("");
    setAddName("");
    setAddRole("sales");
    setAddPassword("");
    setEditName("");
    setEditRole("sales");
    setNewPassword("");
  }, []);

  function openEdit(user: UserRow) {
    setEditName(user.full_name);
    setEditRole(user.role);
    setError(null);
    setSuccess(null);
    setModal({ type: "edit", user });
  }

  function openPassword(user: UserRow) {
    setNewPassword("");
    setError(null);
    setSuccess(null);
    setModal({ type: "password", user });
  }

  async function handleAddUser(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: addEmail,
          password: addPassword,
          full_name: addName,
          role: addRole
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to create user.");
      setUsers((prev) =>
        [...prev, { ...data, created_at: new Date().toISOString() }].sort((a, b) =>
          a.full_name.localeCompare(b.full_name)
        )
      );
      setSuccess(`User "${addName}" created successfully.`);
      closeModal();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unexpected error.");
    } finally {
      setBusy(false);
    }
  }

  async function handleEditUser(e: React.FormEvent) {
    e.preventDefault();
    if (modal?.type !== "edit") return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/users/${modal.user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ full_name: editName, role: editRole })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to update user.");
      setUsers((prev) =>
        prev.map((u) =>
          u.id === modal.user.id ? { ...u, full_name: editName, role: editRole } : u
        )
      );
      setSuccess(`User "${editName}" updated.`);
      closeModal();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unexpected error.");
    } finally {
      setBusy(false);
    }
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    if (modal?.type !== "password") return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/users/${modal.user.id}/password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: newPassword })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to change password.");
      setSuccess(`Password updated for "${modal.user.full_name}".`);
      closeModal();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unexpected error.");
    } finally {
      setBusy(false);
    }
  }

  async function handleToggleActive(user: UserRow) {
    const newActive = !user.is_active;
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch(`/api/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_active: newActive })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to update user.");
      setUsers((prev) =>
        prev.map((u) => (u.id === user.id ? { ...u, is_active: newActive } : u))
      );
      setSuccess(
        `${user.full_name} ${newActive ? "activated" : "deactivated"}.`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unexpected error.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {/* Global feedback */}
      {success ? (
        <div
          className="card"
          style={{
            padding: "10px 16px",
            color: "var(--success-500)",
            borderLeft: "3px solid var(--success-500)",
            marginBottom: "1rem"
          }}
        >
          {success}
          <button
            type="button"
            onClick={() => setSuccess(null)}
            style={{ float: "right", background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)" }}
          >
            ×
          </button>
        </div>
      ) : null}
      {error && !modal ? (
        <div
          className="card"
          style={{
            padding: "10px 16px",
            color: "var(--danger-500)",
            borderLeft: "3px solid var(--danger-500)",
            marginBottom: "1rem"
          }}
        >
          {error}
        </div>
      ) : null}

      <section className="card stack reveal">
        <div className="page-head" style={{ alignItems: "center" }}>
          <h2 style={{ margin: 0 }}>Team Members</h2>
          <button
            className="btn primary"
            type="button"
            onClick={() => { setError(null); setSuccess(null); setModal({ type: "add" }); }}
          >
            + Add User
          </button>
        </div>

        <div className="table-wrap">
          <table className="responsive-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id} style={{ opacity: user.is_active ? 1 : 0.55 }}>
                  <td data-label="Name">
                    <span style={{ fontWeight: 600 }}>{user.full_name}</span>
                    {user.id === currentUserId ? (
                      <span className="muted" style={{ marginLeft: 6, fontSize: "0.78rem" }}>(you)</span>
                    ) : null}
                  </td>
                  <td data-label="Email" className="muted">{user.email}</td>
                  <td data-label="Role">
                    <span className={roleBadgeClass(user.role)}>{roleLabel(user.role)}</span>
                  </td>
                  <td data-label="Status">
                    <span className={user.is_active ? "chip success" : "chip danger"}>
                      {user.is_active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td data-label="Actions">
                    <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap" }}>
                      <button
                        className="btn sm"
                        type="button"
                        onClick={() => openEdit(user)}
                        disabled={busy}
                      >
                        Edit
                      </button>
                      <button
                        className="btn sm"
                        type="button"
                        onClick={() => openPassword(user)}
                        disabled={busy}
                      >
                        Password
                      </button>
                      {user.id !== currentUserId ? (
                        <button
                          className={user.is_active ? "btn sm danger" : "btn sm"}
                          type="button"
                          onClick={() => handleToggleActive(user)}
                          disabled={busy}
                        >
                          {user.is_active ? "Deactivate" : "Activate"}
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
              {users.length === 0 ? (
                <tr>
                  <td colSpan={5}>
                    <div className="empty-state">No users found.</div>
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── Add User Modal ── */}
      {modal?.type === "add" ? (
        <div
          className="modal-overlay"
          onClick={(e) => { if (e.target === e.currentTarget) closeModal(); }}
        >
          <div className="modal-panel" role="dialog" aria-modal="true" aria-labelledby="add-user-title" style={{ maxWidth: 460 }}>
            <h2 id="add-user-title">Add New User</h2>
            <form className="stack" onSubmit={handleAddUser}>
              <div className="field">
                <label htmlFor="add-name">Full Name</label>
                <input
                  id="add-name"
                  value={addName}
                  onChange={(e) => setAddName(e.target.value)}
                  required
                  autoFocus
                />
              </div>
              <div className="field">
                <label htmlFor="add-email">Email</label>
                <input
                  id="add-email"
                  type="email"
                  value={addEmail}
                  onChange={(e) => setAddEmail(e.target.value)}
                  required
                />
              </div>
              <div className="field">
                <label htmlFor="add-role">Role</label>
                <select
                  id="add-role"
                  value={addRole}
                  onChange={(e) => setAddRole(e.target.value as Role)}
                >
                  <option value="sales">Sales</option>
                  <option value="supervisor">Supervisor</option>
                  <option value="manager">Manager</option>
                </select>
              </div>
              <div className="field">
                <label htmlFor="add-password">Password (min 8 characters)</label>
                <input
                  id="add-password"
                  type="password"
                  value={addPassword}
                  onChange={(e) => setAddPassword(e.target.value)}
                  required
                  minLength={8}
                />
              </div>
              {error ? <p style={{ color: "var(--danger-500)", margin: 0 }}>{error}</p> : null}
              <div className="modal-actions">
                <button className="btn" type="button" onClick={closeModal} disabled={busy}>
                  Cancel
                </button>
                <button className="btn primary" type="submit" disabled={busy}>
                  {busy ? "Creating..." : "Create User"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {/* ── Edit User Modal ── */}
      {modal?.type === "edit" ? (
        <div
          className="modal-overlay"
          onClick={(e) => { if (e.target === e.currentTarget) closeModal(); }}
        >
          <div className="modal-panel" role="dialog" aria-modal="true" aria-labelledby="edit-user-title" style={{ maxWidth: 420 }}>
            <h2 id="edit-user-title">Edit User</h2>
            <p className="muted" style={{ marginTop: 0 }}>{modal.user.email}</p>
            <form className="stack" onSubmit={handleEditUser}>
              <div className="field">
                <label htmlFor="edit-name">Full Name</label>
                <input
                  id="edit-name"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  required
                  autoFocus
                />
              </div>
              <div className="field">
                <label htmlFor="edit-role">Role</label>
                <select
                  id="edit-role"
                  value={editRole}
                  onChange={(e) => setEditRole(e.target.value as Role)}
                >
                  <option value="sales">Sales</option>
                  <option value="supervisor">Supervisor</option>
                  <option value="manager">Manager</option>
                </select>
              </div>
              {error ? <p style={{ color: "var(--danger-500)", margin: 0 }}>{error}</p> : null}
              <div className="modal-actions">
                <button className="btn" type="button" onClick={closeModal} disabled={busy}>
                  Cancel
                </button>
                <button className="btn primary" type="submit" disabled={busy}>
                  {busy ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {/* ── Change Password Modal ── */}
      {modal?.type === "password" ? (
        <div
          className="modal-overlay"
          onClick={(e) => { if (e.target === e.currentTarget) closeModal(); }}
        >
          <div className="modal-panel" role="dialog" aria-modal="true" aria-labelledby="pw-title" style={{ maxWidth: 400 }}>
            <h2 id="pw-title">Change Password</h2>
            <p className="muted" style={{ marginTop: 0 }}>{modal.user.full_name} · {modal.user.email}</p>
            <form className="stack" onSubmit={handleChangePassword}>
              <div className="field">
                <label htmlFor="new-password">New Password (min 8 characters)</label>
                <input
                  id="new-password"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  minLength={8}
                  autoFocus
                />
              </div>
              {error ? <p style={{ color: "var(--danger-500)", margin: 0 }}>{error}</p> : null}
              <div className="modal-actions">
                <button className="btn" type="button" onClick={closeModal} disabled={busy}>
                  Cancel
                </button>
                <button className="btn primary" type="submit" disabled={busy}>
                  {busy ? "Updating..." : "Update Password"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
