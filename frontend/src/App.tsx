import React, { useEffect, useState } from "react";
import { fetchEtls, getToken, login, uploadEtl } from "./api";

type Etl = {
  id: string;
  name: string;
  description: string;
  version: string;
  is_active: boolean;
  is_validated: boolean;
};

function App() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(
    !!getToken()
  );
  const [etls, setEtls] = useState<Etl[]>([]);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [version, setVersion] = useState("1.0");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isAuthenticated) {
      loadEtls();
    }
  }, [isAuthenticated]);

  async function loadEtls() {
    try {
      setError(null);
      const data = await fetchEtls();
      setEtls(data);
    } catch (err) {
      console.error(err);
      setError("Could not load ETLs.");
    }
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    try {
      setError(null);
      await login(username, password);
      setIsAuthenticated(true);
      setUsername("");
      setPassword("");
    } catch (err) {
      setError("Login failed. Check your credentials.");
    }
  }

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedFile) {
      setError("Please choose a zip file.");
      return;
    }
    if (!name) {
      setError("Please provide an ETL name.");
      return;
    }

    const formData = new FormData();
    formData.append("name", name);
    formData.append("description", description);
    formData.append("version", version);
    formData.append("zip_file", selectedFile);

    try {
      setLoading(true);
      setError(null);
      await uploadEtl(formData);
      setName("");
      setDescription("");
      setVersion("1.0");
      setSelectedFile(null);
      await loadEtls();
    } catch (err) {
      console.error(err);
      setError("Upload failed. Check file and try again.");
    } finally {
      setLoading(false);
    }
  }

  function handleLogout() {
    localStorage.removeItem("access_token");
    setIsAuthenticated(false);
    setEtls([]);
  }

  if (!isAuthenticated) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#0f172a",
          color: "white"
        }}
      >
        <form
          onSubmit={handleLogin}
          style={{
            width: "100%",
            maxWidth: 380,
            padding: 24,
            borderRadius: 12,
            background: "#020617",
            boxShadow: "0 20px 40px rgba(15,23,42,0.6)"
          }}
        >
          <h1 style={{ marginBottom: 8, fontSize: 24 }}>ETL Platform</h1>
          <p style={{ marginBottom: 24, fontSize: 14, color: "#94a3b8" }}>
            Sign in to upload and run ETLs.
          </p>
          {error && (
            <div
              style={{
                marginBottom: 16,
                padding: 8,
                borderRadius: 8,
                background: "#7f1d1d",
                color: "#fecaca",
                fontSize: 13
              }}
            >
              {error}
            </div>
          )}
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: "block", marginBottom: 4, fontSize: 13 }}>
              Username
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              style={{
                width: "100%",
                padding: "8px 10px",
                borderRadius: 8,
                border: "1px solid #1e293b",
                background: "#020617",
                color: "white"
              }}
              required
            />
          </div>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: "block", marginBottom: 4, fontSize: 13 }}>
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={{
                width: "100%",
                padding: "8px 10px",
                borderRadius: 8,
                border: "1px solid #1e293b",
                background: "#020617",
                color: "white"
              }}
              required
            />
          </div>
          <button
            type="submit"
            style={{
              width: "100%",
              padding: "8px 10px",
              borderRadius: 8,
              border: "none",
              background:
                "linear-gradient(135deg, #4f46e5, #0ea5e9, #22c55e)",
              color: "white",
              fontWeight: 600,
              cursor: "pointer"
            }}
          >
            Sign in
          </button>
        </form>
      </div>
    );
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#020617",
        color: "white",
        padding: "24px 16px"
      }}
    >
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          maxWidth: 960,
          margin: "0 auto 24px"
        }}
      >
        <div>
          <h1 style={{ fontSize: 24 }}>ETL Execution Platform</h1>
          <p style={{ fontSize: 14, color: "#94a3b8" }}>
            First step: upload and list ETLs.
          </p>
        </div>
        <button
          onClick={handleLogout}
          style={{
            padding: "6px 10px",
            borderRadius: 999,
            border: "1px solid #334155",
            background: "transparent",
            color: "#e2e8f0",
            fontSize: 13,
            cursor: "pointer"
          }}
        >
          Logout
        </button>
      </header>

      <main style={{ maxWidth: 960, margin: "0 auto" }}>
        {error && (
          <div
            style={{
              marginBottom: 16,
              padding: 10,
              borderRadius: 8,
              background: "#7f1d1d",
              color: "#fecaca",
              fontSize: 13
            }}
          >
            {error}
          </div>
        )}

        <section
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 1.3fr) minmax(0, 1fr)",
            gap: 20,
            marginBottom: 24
          }}
        >
          <form
            onSubmit={handleUpload}
            style={{
              padding: 16,
              borderRadius: 12,
              background: "#020617",
              border: "1px solid #1e293b"
            }}
          >
            <h2 style={{ fontSize: 18, marginBottom: 12 }}>
              Upload new ETL (zip)
            </h2>
            <div style={{ marginBottom: 10 }}>
              <label
                style={{ display: "block", marginBottom: 4, fontSize: 13 }}
              >
                Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                style={{
                  width: "100%",
                  padding: "6px 8px",
                  borderRadius: 8,
                  border: "1px solid #1e293b",
                  background: "#020617",
                  color: "white",
                  fontSize: 14
                }}
                required
              />
            </div>
            <div style={{ marginBottom: 10 }}>
              <label
                style={{ display: "block", marginBottom: 4, fontSize: 13 }}
              >
                Description
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                style={{
                  width: "100%",
                  padding: "6px 8px",
                  borderRadius: 8,
                  border: "1px solid #1e293b",
                  background: "#020617",
                  color: "white",
                  fontSize: 14,
                  resize: "vertical"
                }}
              />
            </div>
            <div style={{ marginBottom: 10 }}>
              <label
                style={{ display: "block", marginBottom: 4, fontSize: 13 }}
              >
                Version
              </label>
              <input
                type="text"
                value={version}
                onChange={(e) => setVersion(e.target.value)}
                style={{
                  width: "100%",
                  maxWidth: 140,
                  padding: "6px 8px",
                  borderRadius: 8,
                  border: "1px solid #1e293b",
                  background: "#020617",
                  color: "white",
                  fontSize: 14
                }}
              />
            </div>
            <div style={{ marginBottom: 12 }}>
              <label
                style={{ display: "block", marginBottom: 4, fontSize: 13 }}
              >
                ETL zip file
              </label>
              <input
                type="file"
                accept=".zip"
                onChange={(e) =>
                  setSelectedFile(e.target.files?.[0] ?? null)
                }
                style={{ fontSize: 13 }}
              />
              <p style={{ fontSize: 12, color: "#64748b", marginTop: 4 }}>
                Expected: zip with `main.py`, `config.json`, `requirements.txt`,
                etc.
              </p>
            </div>
            <button
              type="submit"
              disabled={loading}
              style={{
                padding: "8px 12px",
                borderRadius: 999,
                border: "none",
                background:
                  "linear-gradient(135deg, #4f46e5, #0ea5e9, #22c55e)",
                color: "white",
                fontWeight: 600,
                fontSize: 14,
                cursor: "pointer",
                opacity: loading ? 0.7 : 1
              }}
            >
              {loading ? "Uploading..." : "Upload ETL"}
            </button>
          </form>

          <div
            style={{
              padding: 16,
              borderRadius: 12,
              background: "#020617",
              border: "1px solid #1e293b",
              fontSize: 13,
              color: "#cbd5f5"
            }}
          >
            <h2 style={{ fontSize: 18, marginBottom: 8 }}>What&apos;s next</h2>
            <ol style={{ paddingLeft: 18, lineHeight: 1.6 }}>
              <li>Validate uploaded ETLs (structure, config, requirements).</li>
              <li>Let users launch executions with input files.</li>
              <li>Stream live logs and show execution history.</li>
              <li>Provide downloads for outputs and archives.</li>
            </ol>
          </div>
        </section>

        <section
          style={{
            padding: 16,
            borderRadius: 12,
            background: "#020617",
            border: "1px solid #1e293b"
          }}
        >
          <h2 style={{ fontSize: 18, marginBottom: 12 }}>Your ETLs</h2>
          {etls.length === 0 ? (
            <p style={{ fontSize: 14, color: "#94a3b8" }}>
              No ETLs yet. Upload your first one above.
            </p>
          ) : (
            <div style={{ display: "grid", gap: 10 }}>
              {etls.map((etl) => (
                <div
                  key={etl.id}
                  style={{
                    padding: 10,
                    borderRadius: 10,
                    border: "1px solid #1e293b",
                    background: "#020617"
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      marginBottom: 4
                    }}
                  >
                    <div>
                      <div style={{ fontSize: 15, fontWeight: 500 }}>
                        {etl.name}
                      </div>
                      <div
                        style={{
                          fontSize: 12,
                          color: "#64748b",
                          marginTop: 2
                        }}
                      >
                        v{etl.version}
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 6, fontSize: 11 }}>
                      <span
                        style={{
                          padding: "2px 8px",
                          borderRadius: 999,
                          border: "1px solid #334155",
                          background: etl.is_validated
                            ? "rgba(34,197,94,0.15)"
                            : "rgba(148,163,184,0.1)"
                        }}
                      >
                        {etl.is_validated ? "validated" : "not validated"}
                      </span>
                      <span
                        style={{
                          padding: "2px 8px",
                          borderRadius: 999,
                          border: "1px solid #334155",
                          background: etl.is_active
                            ? "rgba(34,197,94,0.15)"
                            : "rgba(248,250,252,0.02)"
                        }}
                      >
                        {etl.is_active ? "active" : "inactive"}
                      </span>
                    </div>
                  </div>
                  {etl.description && (
                    <p style={{ fontSize: 13, color: "#cbd5e1" }}>
                      {etl.description}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

export default App;

