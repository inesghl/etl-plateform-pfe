import React, { useState } from "react";
import { Etl } from "../types/etl";
import styles from "../styles/EtlList.module.css";

type Props = {
  etls: Etl[];
  isAdmin: boolean;
  onValidate?: (id: string) => Promise<void>;
  onActivate?: (id: string) => Promise<void>;
};

export function EtlList({ etls, isAdmin, onValidate, onActivate }: Props) {
  if (etls.length === 0)
    return (
      <p className={styles.empty}>
        No ETLs yet.{" "}
        {isAdmin ? "Upload your first one above." : "Contact an admin to publish ETLs."}
      </p>
    );

  return (
    <div className={styles.grid}>
      {etls.map((etl) => (
        <EtlCard
          key={etl.id}
          etl={etl}
          isAdmin={isAdmin}
          onValidate={onValidate}
          onActivate={onActivate}
        />
      ))}
    </div>
  );
}

function EtlCard({ etl, isAdmin, onValidate, onActivate }: {
  etl: Etl;
  isAdmin: boolean;
  onValidate?: (id: string) => Promise<void>;
  onActivate?: (id: string) => Promise<void>;
}) {
  const [busy, setBusy] = useState<"validate" | "activate" | null>(null);
  const [localErr, setLocalErr] = useState<string | null>(null);

  async function handle(action: "validate" | "activate") {
    try {
      setBusy(action);
      setLocalErr(null);
      if (action === "validate") await onValidate?.(etl.id);
      else await onActivate?.(etl.id);
    } catch (e: any) {
      setLocalErr(e.message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className={styles.card}>
      <div className={styles.cardRow}>
        <div>
          <div className={styles.etlName}>{etl.name}</div>
          <div className={styles.etlVersion}>v{etl.version}</div>
        </div>

        <div className={styles.badgeRow}>
          <span className={`${styles.badge} ${etl.is_validated ? styles.badgeGreen : styles.badgeGray}`}>
            {etl.is_validated ? "validated" : "not validated"}
          </span>
          <span className={`${styles.badge} ${etl.is_active ? styles.badgeGreen : styles.badgeGray}`}>
            {etl.is_active ? "active" : "inactive"}
          </span>

          {/* Admin action buttons */}
          {isAdmin && !etl.is_validated && (
            <button
              className={`${styles.btn} ${styles.btnSecondary}`}
              disabled={!!busy}
              onClick={() => handle("validate")}
            >
              {busy === "validate" ? "…" : "✓ Validate"}
            </button>
          )}
          {isAdmin && etl.is_validated && !etl.is_active && (
            <button
              className={`${styles.btn} ${styles.btnSuccess}`}
              disabled={!!busy}
              onClick={() => handle("activate")}
            >
              {busy === "activate" ? "…" : "▶ Activate"}
            </button>
          )}
        </div>
      </div>

      {etl.description && <p className={styles.description}>{etl.description}</p>}
      {localErr && <p className={styles.error}>{localErr}</p>}
    </div>
  );
}