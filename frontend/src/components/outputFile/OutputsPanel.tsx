import React, { useEffect, useState } from "react";
import { OutputFile } from "../../types/outputFile";
import { fetchOutputFiles, downloadOutputFile } from "../../api/outputFile";
import { Button } from "../common/Button";
import { formatFileSize } from "../../utils/formatters";

type Props = {
  executionId: string;
};

export function OutputsPanel({ executionId }: Props) {
  const [outputs, setOutputs] = useState<OutputFile[]>([]);
  const [loading, setLoading] = useState(true);

useEffect(() => {
  fetchOutputFiles(executionId).then(files => {
    setOutputs(files);
    setLoading(false);
  });
}, [executionId]);

  if (loading) return <div style={{ fontSize: 12, color: "#94a3b8" }}>Loading outputs…</div>;
  if (outputs.length === 0) return <div style={{ fontSize: 12, color: "#94a3b8" }}>No output files.</div>;

  return (
    <div style={{ marginTop: 10 }}>
      {outputs.map(o => (
        <div key={o.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", borderRadius: 8, border: "1px solid #e2e8f0", background: "#f8fafc", marginBottom: 6 }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: "#0f172a" }}>📄 {o.filename}</div>
            <div style={{ fontSize: 11, color: "#94a3b8" }}>
              {o.file_type.toUpperCase()} · {formatFileSize(o.file_size)}
              {o.download_count > 0 && ` · downloaded ${o.download_count}×`}
            </div>
          </div>
          <Button small variant="success" onClick={() => downloadOutputFile(o.id, o.filename)}>
            ⬇ Download
          </Button>
        </div>
      ))}
    </div>
  );
}