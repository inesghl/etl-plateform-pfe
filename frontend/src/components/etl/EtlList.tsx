// components/etl/EtlList.tsx
import React, { useState, useMemo } from "react";
import { Etl } from "../../types/etl";
import { User } from "../../types/user";
import { UserGroup } from "../../types/group";
import { EtlCard } from "./EtlCard";
import { Empty } from "../common/Empty";

type Props = {
  etls: Etl[];
  isAdmin: boolean;
  currentUser?: User;
  availableGroups?: UserGroup[];
  onValidate?: (id: string) => Promise<void>;
  onActivate?: (id: string) => Promise<void>;
  onLaunch?: (etl: Etl) => void;
  onRefresh?: () => void;
};

export function EtlList({
  etls,
  isAdmin,
  currentUser,
  availableGroups = [],
  onValidate,
  onActivate,
  onLaunch,
  onRefresh,
}: Props) {
  const [query, setQuery] = useState("");

  const filteredEtls = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return etls;
    return etls.filter(e =>
      e.name.toLowerCase().includes(q) ||
      (e.description ?? "").toLowerCase().includes(q)
    );
  }, [etls, query]);

  return (
    <div>
      {/* Search bar — always visible so layout doesn't jump when ETLs load */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
        <div style={{ position: "relative", flex: 1 }}>
          <svg
            style={{
              position: "absolute", left: 10, top: "50%",
              transform: "translateY(-50%)", width: 15, height: 15,
              opacity: 0.4, pointerEvents: "none",
            }}
            viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2"
          >
            <circle cx="8.5" cy="8.5" r="5.5" />
            <line x1="13" y1="13" x2="18" y2="18" />
          </svg>
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search ETLs by name or description…"
            style={{
              width: "100%", padding: "8px 10px 8px 34px", borderRadius: 8,
              border: "1px solid #e2e8f0", background: "#f8fafc",
              color: "#0f172a", fontSize: 13, boxSizing: "border-box", outline: "none",
            }}
          />
        </div>
        {query && (
          <span style={{ fontSize: 12, color: "#94a3b8", whiteSpace: "nowrap" }}>
            {filteredEtls.length} result{filteredEtls.length !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      {/* Empty states */}
      {etls.length === 0 && (
        <Empty
          icon="📦"
          text={isAdmin ? "No ETLs uploaded yet." : "No ETLs available yet."}
        />
      )}
      {etls.length > 0 && filteredEtls.length === 0 && (
        <Empty icon="🔍" text={`No ETLs match "${query}"`} />
      )}

      {/* List */}
      {filteredEtls.map(etl => (
        <EtlCard
          key={etl.id}
          etl={etl}
          isAdmin={isAdmin}
          currentUser={currentUser}
          availableGroups={availableGroups}
          onValidate={onValidate}
          onActivate={onActivate}
          onLaunch={onLaunch}
          onRefresh={onRefresh}
        />
      ))}
    </div>
  );
}