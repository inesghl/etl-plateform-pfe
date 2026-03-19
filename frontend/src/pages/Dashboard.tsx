import React, { useEffect, useState } from "react";
import { User } from "../types/user";
import { Etl } from "../types/etl";
import { Execution } from "../types/execution";
import { Header } from "../components/Header";
import { PageLayout } from "../components/PageLayout";
import { Tabs } from "../components/common/Tabs";
import { Button } from "../components/common/Button";
import { UploadEtlForm } from "../components/etl/UploadEtlForm";
import { EtlList } from "../components/etl/EtlList";
import { ExecutionList } from "../components/execution/ExecutionList";
import { LaunchModal } from "../components/execution/LaunchModal";
import { LogModal } from "../components/execution/LogModal";
import { OutputsPanel } from "../components/outputFile/OutputsPanel";
import { NotificationList } from "../components/notification/NotificationList";
import { InputFileViewer } from "../components/execution/InputFileViewer";
import { Card } from "../components/common/Card";
import { useEtls } from "../hooks/useEtls";
import { useExecutions } from "../hooks/useExecutions";
import { useNotifications } from "../hooks/useNotifications";
import styles from "../styles/Dashboard.module.css";

type Props = {
  currentUser: User;
  onLogout: () => void;
};

function Dashboard({ currentUser, onLogout }: Props) {
  const { etls, loading: etlLoading, error: etlError, loadEtls, upload, validate, activate } = useEtls();
  const { executions, loadExecutions, create: createExecution, launch: launchExecution } = useExecutions();
  const { notifications, unreadCount, loadNotifications, markRead, markAllRead } = useNotifications();

  const [tab, setTab] = useState("etls");
  const [launchEtl, setLaunchEtl] = useState<Etl | null>(null);
  const [logExec, setLogExec] = useState<Execution | null>(null);
  const [outputExec, setOutputExec] = useState<Execution | null>(null);
  const [inputExec, setInputExec] = useState<Execution | null>(null); // ✅ ONE variable only!

  useEffect(() => {
    loadEtls();
    loadExecutions();
    loadNotifications();
  }, [loadEtls, loadExecutions, loadNotifications]);

  const isAdmin = currentUser.is_admin;
  const activeEtls = etls.filter(e => e.is_active && e.is_validated);
  const displayEtls = isAdmin ? etls : activeEtls;

  const tabs = [
    { id: "etls", label: isAdmin ? "Manage ETLs" : "Available ETLs" },
    ...(isAdmin ? [{ id: "upload", label: "Upload ETL" }] : []),
    { id: "executions", label: "Executions" },
    { id: "notifications", label: "Notifications", badge: unreadCount },
  ];

  function handleLaunchDone() {
    loadExecutions();
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
              onValidate={validate}
              onActivate={activate}
              onLaunch={setLaunchEtl}
            />
          </>
        )}

        {/* Upload Tab (Admin only) */}
        {tab === "upload" && isAdmin && (
          <UploadEtlForm onUpload={upload} loading={etlLoading} />
        )}

        {/* Executions Tab */}
        {tab === "executions" && (
          <>
            <div className={styles.sectionHeader}>
              <h2 className={styles.sectionTitle}>Executions ({executions.length})</h2>
              <Button small variant="secondary" onClick={loadExecutions}>
                ↻ Refresh
              </Button>
            </div>
            <ExecutionList
              executions={executions}
              onViewLogs={setLogExec}
              onViewOutputs={setOutputExec}
              onViewInputs={setInputExec}
            />
          </>
        )}

        {/* Notifications Tab */}
        {tab === "notifications" && (
          <>
            <div className={styles.sectionHeader}>
              <h2 className={styles.sectionTitle}>Notifications ({notifications.length})</h2>
              {unreadCount > 0 && (
                <Button small variant="ghost" onClick={markAllRead}>
                  Mark all read
                </Button>
              )}
            </div>
            <NotificationList notifications={notifications} onMarkRead={markRead} />
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
              <button onClick={() => setOutputExec(null)} className={styles.closeButton}>
                ×
              </button>
            </div>
            <OutputsPanel executionId={outputExec.id} />
          </Card>
        </div>
      )}

      {/* ✅ Input File Viewer - Use inputExec */}
      {inputExec && (
        <InputFileViewer
          execution={inputExec}
          onClose={() => setInputExec(null)}
        />
      )}
    </div>
  );
}

export default Dashboard;