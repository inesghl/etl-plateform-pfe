// components/etl/EtlList.tsx
import React from "react";
import { Etl } from "../../types/etl";
import { UserGroup } from "../../types/group";
import { EtlCard } from "./EtlCard";
import { Empty } from "../common/Empty";

type Props = {
  etls: Etl[];
  isAdmin: boolean;
  availableGroups?: UserGroup[];
  onValidate?: (id: string) => Promise<void>;
  onActivate?: (id: string) => Promise<void>;
  onLaunch?: (etl: Etl) => void;
  onRefresh?: () => void;
};

export function EtlList({
  etls, isAdmin, availableGroups = [],
  onValidate, onActivate, onLaunch, onRefresh,
}: Props) {
  if (etls.length === 0) {
    return (
      <Empty
        icon="📦"
        text={isAdmin ? "No ETLs yet. Upload one above." : "No ETLs available yet. Contact an admin."}
      />
    );
  }

  return (
    <div>
      {etls.map((etl) => (
        <EtlCard
          key={etl.id}
          etl={etl}
          isAdmin={isAdmin}
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