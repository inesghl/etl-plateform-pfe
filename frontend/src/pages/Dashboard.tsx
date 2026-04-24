// pages/Dashboard.tsx
import React, { useEffect, useState } from "react";
import { User } from "../types/user";
import { Etl } from "../types/etl";
import { Execution } from "../types/execution";
import { UserGroup } from "../types/group";
import { Header } from "../components/Header";
import { PageLayout } from "../components/PageLayout";
import { Tabs } from "../components/common/Tabs";
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
import { useEtls } from "../hooks/useEtls";
import { useExecutions } from "../hooks/useExecutions";
import { useNotifications } from "../hooks/useNotifications";
import { fetchGroups } from "../api/groups";
import { InputPathViewer } from "../components/execution/InputPathViewer";
import styles from "../styles/Dashboard.module.css";

type Props = {
  currentUser: User;
  onLogout: () => void;
};

function Dashboard({ currentUser, onLogout }: Props) {
  const { etls, loading: etlLoading, error: etlError, loadEtls, upload, validate, activate, getConfig } = useEtls();
  const { executions, loadExecutions, create: createExecution, launch: launchExecution } = useExecutions();
  const { notifications, unreadCount, loadNotifications, markRead, markAllRead, remove } = useNotifications();

  const [tab, setTab] = useState("etls");
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
  }, [loadEtls, loadExecutions, loadNotifications, isAdmin]);

  const tabs = [
    { id: "etls", label: isAdmin ? "Manage ETLs" : "Available ETLs" },
    ...(isAdmin ? [{ id: "upload", label: "Upload ETL" }] : []),
    ...(isAdmin ? [{ id: "groups", label: "Groups" }] : []),
    { id: "executions", label: "Executions" },
    { id: "notifications", label: "Notifications", badge: unreadCount },
  ];

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

  // Called from the ⏰ banner inside ExecutionCard:
  // find the matching ETL and open LaunchModal, then switch to executions tab.
  function handleReviewScheduled(exec: Execution) {
    const etl = etls.find(e => e.id === exec.etl);
    if (etl) setLaunchEtl(etl);
    setTab("executions");
  }

  return (
    <div className={styles.page}>
      <Header currentUser={currentUser} onLogout={onLogout} />

      <PageLayout>
        {etlError && <div className={styles.errorBanner}>{etlError}</div>}

        <Tabs tabs={tabs} active={tab} onChange={setTab} />

        {/* ETLs Tab */}
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
              onLaunch={setLaunchEtl}
              onRefresh={handleRefreshAll}
            />
          </>
        )}

        {/* Upload Tab (Admin only) */}
        {tab === "upload" && isAdmin && (
          <UploadEtlForm
            onUpload={upload}
            onGetConfig={getConfig}
            loading={etlLoading}
          />
        )}

        {/* Groups Tab (Admin only) */}
        {tab === "groups" && isAdmin && (
          <>
            <h2 className={styles.sectionTitle}>User Groups</h2>
            <p style={{ fontSize: 13, color: "#64748b", marginBottom: 16 }}>
              Create groups, add members, then assign ETLs to groups from the ETL cards.
              ETLs with no group assigned are visible to all users.
            </p>
            <GroupManager />
          </>
        )}

        {/* Executions Tab */}
        {tab === "executions" && (
          <>
            <div className={styles.sectionHeader}>
              <h2 className={styles.sectionTitle}>Executions ({executions.length})</h2>
              <Button small variant="secondary" onClick={loadExecutions}>↻ Refresh</Button>
            </div>
            <ExecutionList
              executions={executions}
              onViewLogs={setLogExec}
              onViewOutputs={setOutputExec}
              onViewInputs={setInputExec}
              onReviewScheduled={handleReviewScheduled}
            />
          </>
        )}

        {/* Notifications Tab */}
        {tab === "notifications" && (
          <>
            <div className={styles.sectionHeader}>
              <h2 className={styles.sectionTitle}>
                Notifications ({notifications.length})
                {unreadCount > 0 && (
                  <span style={{
                    marginLeft: 8, fontSize: 12, fontWeight: 600,
                    background: "#dc2626", color: "#fff",
                    padding: "1px 7px", borderRadius: 99,
                  }}>
                    {unreadCount} unread
                  </span>
                )}
              </h2>
              {unreadCount > 0 && (
                <Button small variant="ghost" onClick={markAllRead}>Mark all read</Button>
              )}
            </div>
            <NotificationList
              notifications={notifications}
              onMarkRead={markRead}
              onDeleted={remove}
            />
          </>
        )}
      </PageLayout>

      {/* Modals */}
      {launchEtl && (
        <LaunchModal
          etl={launchEtl}
          onClose={() => setLaunchEtl(null)}
          onDone={handleLaunchDone}
          onCreateExecution={createExecution}
          onLaunch={launchExecution}
        />
      )}

      {logExec && <LogModal execution={logExec} onClose={() => setLogExec(null)} />}

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