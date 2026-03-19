import React from "react";
import { Etl } from "../../types/etl";
import { EtlCard } from "./EtlCard";
import { Empty } from "../common/Empty";

type Props = {
  etls: Etl[];
  isAdmin: boolean;
  onValidate?: (id: string) => Promise<void>;
  onActivate?: (id: string) => Promise<void>;
  onLaunch?: (etl: Etl) => void;
};

export function EtlList({ etls, isAdmin, onValidate, onActivate, onLaunch }: Props) {
  if (etls.length === 0) {
    return <Empty icon="📦" text={isAdmin ? "No ETLs yet. Upload one above." : "No ETLs available yet. Contact an admin."} />;
  }

  return (
    <div>
      {etls.map((etl) => (
        <EtlCard
          key={etl.id}
          etl={etl}
          isAdmin={isAdmin}
          onValidate={onValidate}
          onActivate={onActivate}
          onLaunch={onLaunch}
        />
      ))}
    </div>
  );
}