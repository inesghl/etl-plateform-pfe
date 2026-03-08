import React, { useEffect } from "react";
import { Header } from "../components/Header";
import { UploadEtlForm } from "../components/ UploadEtlForm";
import { EtlList } from "../components/EtlList";
import { useEtls } from "../hooks/useEtls";
import { User } from "../types/user";
import styles from "../styles/Dashboard.module.css";

type Props = { currentUser: User; onLogout: () => void };

export function Dashboard({ currentUser, onLogout }: Props) {
  const { etls, loadEtls, upload, validate, activate, loading, error } = useEtls();

  useEffect(() => {
    loadEtls();
  }, []);

  return (
    <div className={styles.page}>
      <Header onLogout={onLogout} />

      <main className={styles.main}>
        {error && <div className={styles.errorBanner}>{error}</div>}

        {currentUser.is_admin && (
          <UploadEtlForm onUpload={upload} loading={loading} />
        )}

        <section className={styles.listSection}>
          <h2 className={styles.sectionTitle}>
            {currentUser.is_admin ? "All ETLs" : "Available ETLs"}
          </h2>
          <EtlList
            etls={etls}
            isAdmin={currentUser.is_admin}
            onValidate={validate}
            onActivate={activate}
          />
        </section>
      </main>
    </div>
  );
}