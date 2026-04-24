// components/etl/EtlList.tsx
import React from "react";
import { Etl } from "../../types/etl";
import { User } from "../../types/user";
import { UserGroup } from "../../types/group";
import { EtlCard } from "./EtlCard";
import { Empty } from "../common/Empty";

type Props = {
  etls: Etl[];
  isAdmin: boolean;
  currentUser?: User;             // ← added
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
  if (etls.length === 0) {
    return (
      <Empty
        icon="📦"
        text={isAdmin ? "No ETLs uploaded yet." : "No ETLs available yet."}
      />
    );
  }

  return (
    <div>
      {etls.map(etl => (
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