import React, { useEffect, useState } from "react";
import { User } from "../types/user";
import { Etl } from "../types/etl";
import { Execution } from "../types/execution";
import { UserGroup } from "../types/group";
import { Header } from "../components/Header";
import { Button } from "../components/common/Button";
import { UploadEtlForm } from "../components/etl/UploadEtlForm";
import { EtlList } from "../components/etl/EtlList";
import { ExecutionList } from "../components/execution/ExecutionList";
import LaunchModal from "../components/execution/LaunchModal";
import { LogModal } from "../components/execution/LogModal";
import { OutputsPanel } from "../components/outputFile/OutputsPanel";
import { NotificationList } from "../components/notification/NotificationList";
import { Card } from "../components/common/Card";
import { GroupManager } from "../components/groups/GroupManager";
import { ProfilePage } from "../components/users/ProfilePage";
import { UsersPage } from "../components/users/UserPage";
import { StatsPanel } from "../components/stats/StatsPanel";
import { UserStatsPanel } from "../components/stats/UserStatsPanel";
import { useEtls } from "../hooks/useEtls";
import { useExecutions } from "../hooks/useExecutions";
import { useNotifications } from "../hooks/useNotifications";
import { fetchGroups } from "../api/groups";
import { InputPathViewer } from "../components/execution/InputPathViewer";
import styles from "../styles/Dashboard.module.css";

type Props = {
  currentUser: User;
  onLogout: () => void;
  onUserUpdated: (user: User) => void;
};

function Dashboard({ currentUser, onLogout, onUserUpdated }: Props) {
  const { etls, loading: etlLoading, error: etlError, loadEtls, upload, validate, activate, deactivate, getConfig } = useEtls();
  const { executions, loadExecutions, create: createExecution, launch: launchExecution } = useExecutions();
  const { notifications, unreadCount, loadNotifications, markUnread, markAllRead, remove } = useNotifications();

  // Read URL params — used by email deep links (?tab=executions&q=ETL+Name)
  const urlParams = new URLSearchParams(window.location.search);
  // Admins default to platform dashboard, regular users to their personal dashboard
  const initialTab = urlParams.get("tab") || (currentUser.is_admin ? "stats" : "my-stats");
  const initialSearch = urlParams.get("q") || "";

  const [tab, setTab] = useState<string>(initialTab);
  const [execSearch, setExecSearch] = useState<string>(initialSearch);
  const [launchEtl, setLaunchEtl] = useState<Etl | null>(null);
  const [logExec, setLogExec] = useState<Execution | null>(null);
  const [outputExec, setOutputExec] = useState<Execution | null>(null);
  const [inputExec, setInputExec] = useState<Execution | null>(null);
  const [groups, setGroups] = useState<UserGroup[]>([]);

  const isAdmin = currentUser.is_admin;
  const activeEtls = etls.filter(e => e.is_active && e.is_validated);
  const displayEtls = isAdmin ? etls : activeEtls;

  useEffect(() => {
    loadEtls();
    loadExecutions();
    loadNotifications();
    if (isAdmin) {
      fetchGroups().then(setGroups).catch(console.error);
    }
    // Clean the URL params after reading them (keeps the address bar tidy)
    if (window.location.search) {
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, [loadEtls, loadExecutions, loadNotifications, isAdmin]);

  // Auto-refresh the executions list while any execution is active
  useEffect(() => {
    const active = ["PENDING", "INSTALLING_DEPS", "RUNNING", "VALIDATING"];
    const hasActive = executions.some(e => active.includes(e.status));
    if (!hasActive) return;
    const timer = setInterval(loadExecutions, 4000);
    return () => clearInterval(timer);
  }, [executions, loadExecutions]);

  function handleTabChange(next: string) {
    setTab(next);
    if (next === "notifications" && unreadCount > 0) {
      markAllRead();
    }
  }

  function handleLaunchDone() {
    loadExecutions();
    setTab("executions");
  }

  async function handleRefreshAll() {
    await loadEtls();
    if (isAdmin) {
      const gs = await fetchGroups();
      setGroups(gs);
    }
  }

  function handleReviewScheduled(exec: Execution) {
    const etl = etls.find(e => e.id === exec.etl);
    if (etl) setLaunchEtl(etl);
    setTab("executions");
  }

  function navClass(id: string) {
    return `${styles.navItem}${tab === id ? ` ${styles.active}` : ""}`;
  }

  return (
    <div className={styles.page}>
      <Header currentUser={currentUser} onLogout={onLogout} />

      <div className={styles.layout}>
        {/* ── Sidebar ── */}
        <nav className={styles.sidebar}>
          <div className={styles.navSection}>

            {/* My Dashboard — all users */}
            <button className={navClass("my-stats")} onClick={() => handleTabChange("my-stats")}>
              <i className="ti ti-chart-bar" aria-hidden="true" />
              My Dashboard
            </button>

            {/* Platform Dashboard — admin only */}
            {isAdmin && (
              <button className={navClass("stats")} onClick={() => handleTabChange("stats")}>
                <i className="ti ti-layout-dashboard" aria-hidden="true" />
                Platform Stats
              </button>
            )}
            <div className={styles.navDivider} />

            {/* ETLs */}
            <div className={styles.navLabel}>ETLs</div>
            <button className={navClass("etls")} onClick={() => handleTabChange("etls")}>
              <i className="ti ti-file-stack" aria-hidden="true" />
              {isAdmin ? "Manage ETLs" : "Available ETLs"}
            </button>
            {isAdmin && (
              <button className={navClass("upload")} onClick={() => handleTabChange("upload")}>
                <i className="ti ti-upload" aria-hidden="true" />
                Upload ETL
              </button>
            )}

            <div className={styles.navDivider} />

            {/* Activity */}
            <div className={styles.navLabel}>Activity</div>
            <button className={navClass("executions")} onClick={() => handleTabChange("executions")}>
              <i className="ti ti-player-play" aria-hidden="true" />
              Executions
            </button>
            <button className={navClass("notifications")} onClick={() => handleTabChange("notifications")}>
              <i className="ti ti-bell" aria-hidden="true" />
              Notifications
              {unreadCount > 0 && (
                <span className={styles.navBadge}>{unreadCount}</span>
              )}
            </button>

            {/* Admin section */}
            {isAdmin && (
              <>
                <div className={styles.navDivider} />
                <div className={styles.navLabel}>Admin</div>
                <button className={navClass("groups")} onClick={() => handleTabChange("groups")}>
                  <i className="ti ti-users-group" aria-hidden="true" />
                  Groups
                </button>
                <button className={navClass("users")} onClick={() => handleTabChange("users")}>
                  <i className="ti ti-user" aria-hidden="true" />
                  Users
                </button>
              </>
            )}

            <div className={styles.navDivider} />

            {/* Profile */}
            <button className={navClass("profile")} onClick={() => handleTabChange("profile")}>
              <i className="ti ti-user-circle" aria-hidden="true" />
              My Profile
            </button>

          </div>
        </nav>

        {/* ── Main content ── */}
        <main className={styles.main}>
          {etlError && <div className={styles.errorBanner}>{etlError}</div>}

          {/* Personal Dashboard — all users */}
          {tab === "my-stats" && (
            <>
              <div className={styles.sectionHeader}>
                <h2 className={styles.sectionTitle}>My Dashboard</h2>
              </div>
              <UserStatsPanel currentUser={currentUser} />
            </>
          )}

          {/* Platform Stats — admin only */}
          {tab === "stats" && isAdmin && (
            <>
              <div className={styles.sectionHeader}>
                <h2 className={styles.sectionTitle}>Platform Stats</h2>
              </div>
              <StatsPanel />
            </>
          )}

          {/* ETLs */}
          {tab === "etls" && (
            <>
              <h2 className={styles.sectionTitle}>
                {isAdmin ? `All ETLs (${etls.length})` : `Available ETLs (${activeEtls.length})`}
              </h2>
              <EtlList
                etls={displayEtls}
                isAdmin={isAdmin}
                currentUser={currentUser}
                availableGroups={groups}
                onValidate={validate}
                onActivate={activate}
                onDeactivate={deactivate}
                onLaunch={setLaunchEtl}
                onRefresh={handleRefreshAll}
              />
            </>
          )}

          {/* Upload */}
          {tab === "upload" && isAdmin && (
            <UploadEtlForm
              onUpload={upload}
              onGetConfig={getConfig}
              loading={etlLoading}
            />
          )}

          {/* Executions */}
          {tab === "executions" && (
            <>
              <div className={styles.sectionHeader}>
                <h2 className={styles.sectionTitle}>Executions ({executions.length})</h2>
                <Button small variant="secondary" onClick={loadExecutions}>↻ Refresh</Button>
              </div>
              <ExecutionList
                executions={executions}
                initialSearch={execSearch}
                onViewLogs={setLogExec}
                onViewOutputs={setOutputExec}
                onViewInputs={setInputExec}
                onReviewScheduled={handleReviewScheduled}
              />
            </>
          )}

          {/* Notifications */}
          {tab === "notifications" && (
            <>
              <div className={styles.sectionHeader}>
                <h2 className={styles.sectionTitle}>Notifications ({notifications.length})</h2>
              </div>
              <NotificationList
                notifications={notifications}
                onMarkUnread={markUnread}
                onDeleted={remove}
              />
            </>
          )}

          {/* Groups */}
          {tab === "groups" && isAdmin && (
            <>
              <h2 className={styles.sectionTitle}>User Groups</h2>
              <p style={{ fontSize: 13, color: "#64748b", marginBottom: 16 }}>
                Create groups, add members, then assign ETLs to groups from the ETL cards.
                ETLs with no group assigned are visible to all users.
              </p>
              <GroupManager onGroupsChanged={() => { fetchGroups().then(setGroups).catch(console.error); }} />
            </>
          )}

          {/* Users */}
          {tab === "users" && isAdmin && (
            <UsersPage currentUser={currentUser} />
          )}

          {/* Profile */}
          {tab === "profile" && (
            <ProfilePage
              currentUser={currentUser}
              onProfileUpdated={onUserUpdated}
            />
          )}
        </main>
      </div>

      {/* ── Modals ── */}
      {launchEtl && (
        <LaunchModal
          etl={launchEtl}
          onClose={() => setLaunchEtl(null)}
          onDone={handleLaunchDone}
          onCreateExecution={createExecution}
          onLaunch={launchExecution}
        />
      )}

      {logExec && (
        <LogModal execution={logExec} onClose={() => setLogExec(null)} />
      )}

      {outputExec && (
        <div className={styles.modalOverlay}>
          <Card style={{ width: "100%", maxWidth: 520 }}>
            <div className={styles.modalHeader}>
              <div className={styles.modalTitle}>
                Output files — {outputExec.execution_label || outputExec.etl_name}
              </div>
              <button onClick={() => setOutputExec(null)} className={styles.closeButton}>×</button>
            </div>
            <OutputsPanel executionId={outputExec.id} />
          </Card>
        </div>
      )}

      {inputExec && (
        <InputPathViewer execution={inputExec} onClose={() => setInputExec(null)} />
      )}
    </div>
  );
}

export default Dashboard;