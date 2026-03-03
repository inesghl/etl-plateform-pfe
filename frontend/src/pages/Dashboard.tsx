import React, { useEffect } from "react";
import { Header } from "../components/Header";
import { UploadEtlForm } from "../components/ UploadEtlForm";
import { EtlList } from "../components/EtlList";
import { useEtls } from "../hooks/useEtls";
import { User } from "../types/user";

type Props = { currentUser: User; onLogout: () => void };

export function Dashboard({ currentUser, onLogout }: Props) {
  const { etls, loadEtls, upload, loading, error } = useEtls();
 useEffect(() => {
    loadEtls();
  }, []);
  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#f8fafc",
        color: "#0f172a",
        padding: "24px 16px"
      }}
    >
      {/* Header */}
      <Header onLogout={onLogout} />

      <main style={{ maxWidth: 960, margin: "0 auto" }}>
        {/* Error display */}
        {error && (
          <div
            style={{
              marginBottom: 16,
              padding: 10,
              borderRadius: 8,
              background: "#fee2e2",
              color: "#b91c1c",
              fontSize: 13
            }}
          >
            {error}
          </div>
        )}

        {/* Upload form */}
        {currentUser.is_admin && (
          <UploadEtlForm onUpload={upload} loading={loading} />
        )}

        {/* ETL list */}
        <section
          style={{
            padding: 16,
            borderRadius: 12,
            background: "#ffffff",
            border: "1px solid #e2e8f0",
            boxShadow: "0 4px 8px rgba(15,23,42,0.04)"
          }}
        >
          <EtlList etls={etls} isAdmin={currentUser.is_admin} />
        </section>
      </main>
    </div>
  );
}
