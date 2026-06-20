import { useState, useEffect } from "react";
import axios from "axios";
import {
  Activity,
  Clock,
  CheckCircle,
  AlertTriangle,
  FileText,
  Play,
  Trash2,
  X,
} from "lucide-react";
import { runSyncJob, deleteSyncLog } from "../data/userManager";

const API_BASE = "http://localhost:5005/api";

export default function SyncJobs() {
  const [cronStatus, setCronStatus] = useState([]);
  const [logs, setLogs] = useState([]);
  const [isHealthy, setIsHealthy] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [selectedJob, setSelectedJob] = useState(null);
  const [selectedLog, setSelectedLog] = useState(null); // For modal

  const loadData = async () => {
    try {
      const [cronRes, logsRes] = await Promise.all([
        axios.get(`${API_BASE}/cron-status`),
        axios.get(`${API_BASE}/sync-logs`),
      ]);
      setCronStatus(
        Array.isArray(cronRes.data) ? cronRes.data : [cronRes.data],
      );
      setLogs(logsRes.data || []);

      if (logsRes.data && logsRes.data.length > 0) {
        const lastRun = logsRes.data[0];
        setIsHealthy(lastRun.status === "SUCCESS");
        if (lastRun.status === "IN_PROGRESS") {
          setIsSyncing(true);
        } else {
          setIsSyncing(false);
        }
      }
    } catch (err) {
      console.error("Failed to load sync jobs data", err);
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadData();
    const interval = setInterval(loadData, isSyncing ? 2000 : 30000);
    return () => clearInterval(interval);
  }, [isSyncing]);

  const handleRunSync = async (jobName) => {
    setIsSyncing(true);
    try {
      if (jobName === "NSE Market Data") {
        await axios.post(`${API_BASE}/nse-sync-run`);
      } else if (jobName === "GCS Market Data") {
        await axios.post(`${API_BASE}/gcs-market-run`);
      } else if (jobName === "GCS Analyst Estimates Data") {
        await axios.post(`${API_BASE}/gcs-estimates-run`);
      } else if (jobName === "GCS Earnings Calendar") {
        await axios.post(`${API_BASE}/gcs-earnings-run`);
      } else {
        await runSyncJob();
      }
    } catch (err) {
      console.error("Sync failed to start", err);
    }
  };

  const handleDeleteLog = async (id, e) => {
    e.stopPropagation();
    try {
      await deleteSyncLog(id);
      setLogs(logs.filter((log) => log.id !== id));
    } catch (err) {
      console.error("Failed to delete log", err);
    }
  };

  // Filter logs by selected job
  const displayedLogs = selectedJob
    ? logs.filter((l) => l.job_name === selectedJob)
    : logs;

  return (
    <div
      className="page-content page-fade"
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        gap: "24px",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexShrink: 0,
        }}
      >
        <h1
          style={{ fontSize: "28px", fontWeight: 600, letterSpacing: "-0.5px" }}
        >
          Pipeline Monitoring
        </h1>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            background: isHealthy
              ? "var(--accent-green-dim)"
              : "var(--accent-red-dim)",
            padding: "6px 16px",
            borderRadius: "100px",
            border: `1px solid ${isHealthy ? "var(--accent-green)" : "var(--accent-red)"}`,
          }}
        >
          {isHealthy ? (
            <CheckCircle size={16} color="var(--accent-green)" />
          ) : (
            <AlertTriangle size={16} color="var(--accent-red)" />
          )}
          <span
            style={{
              fontSize: "14px",
              fontWeight: 500,
              color: isHealthy ? "var(--accent-green)" : "var(--accent-red)",
            }}
          >
            {isHealthy ? "System Healthy" : "Action Required"}
          </span>
        </div>
      </div>

      {/* Glassmorphism Job Cards */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
          gap: "20px",
          flexShrink: 0,
        }}
      >
        {/* 'All Jobs' Card */}
        <div
          className={`glass-card ${selectedJob === null ? "selected" : ""}`}
          onClick={() => setSelectedJob(null)}
          style={{
            padding: "24px",
            cursor: "pointer",
            display: "flex",
            flexDirection: "column",
            gap: "16px",
            border:
              selectedJob === null
                ? "1px solid var(--accent-blue)"
                : "1px solid rgba(255,255,255,0.08)",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
            }}
          >
            <div
              style={{
                background: "var(--accent-blue-dim)",
                padding: "12px",
                borderRadius: "12px",
              }}
            >
              <Activity size={24} color="var(--accent-blue)" />
            </div>
            <div style={{ fontSize: "24px", fontWeight: 600 }}>
              {logs.length}
            </div>
          </div>
          <div>
            <div
              style={{
                fontSize: "18px",
                fontWeight: 500,
                color: "var(--text-primary)",
              }}
            >
              All Executions
            </div>
            <div
              style={{
                fontSize: "14px",
                color: "var(--text-muted)",
                marginTop: "4px",
              }}
            >
              Overview of all pipelines
            </div>
          </div>
        </div>

        {/* Dynamic Job Cards */}
        {cronStatus.map((job, idx) => {
          const isSelected = selectedJob === job.job;

          return (
            <div
              key={idx}
              className={`glass-card ${isSelected ? "selected" : ""}`}
              onClick={() => setSelectedJob(job.job)}
              style={{
                padding: "24px",
                cursor: "pointer",
                display: "flex",
                flexDirection: "column",
                gap: "16px",
                border: isSelected
                  ? "1px solid var(--accent-purple)"
                  : "1px solid rgba(255,255,255,0.08)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                }}
              >
                <div
                  style={{
                    background: "var(--surface-3)",
                    padding: "12px",
                    borderRadius: "12px",
                  }}
                >
                  <Clock size={24} color="var(--text-primary)" />
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleRunSync(job.job);
                  }}
                  disabled={isSyncing}
                  className="btn btn-outline"
                  style={{
                    padding: "6px 12px",
                    fontSize: "12px",
                    borderRadius: "100px",
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                  }}
                >
                  <Play size={12} fill="currentColor" /> Run Now
                </button>
              </div>

              <div>
                <div
                  style={{
                    fontSize: "18px",
                    fontWeight: 500,
                    color: "var(--text-primary)",
                  }}
                >
                  {job.job}
                </div>
                <div
                  style={{
                    fontSize: "13px",
                    color: "var(--text-muted)",
                    marginTop: "6px",
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                  }}
                >
                  <span>Schedule: {job.cronExpression}</span>
                  <span>•</span>
                  <span>{job.tz}</span>
                </div>

                {job.nextRun && (
                  <div
                    style={{
                      fontSize: "13px",
                      color: "var(--text-secondary)",
                      marginTop: "8px",
                      background: "var(--surface-3)",
                      padding: "6px 10px",
                      borderRadius: "6px",
                      display: "inline-block",
                    }}
                  >
                    Next:{" "}
                    {new Date(job.nextRun).toLocaleString(undefined, {
                      weekday: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Logs Table (Glass Panel) */}
      <div
        className="glass-panel"
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          minHeight: 0,
        }}
      >
        <div
          style={{
            padding: "20px 24px",
            borderBottom: "1px solid rgba(255,255,255,0.05)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <h2
            style={{
              fontSize: "16px",
              fontWeight: 500,
              display: "flex",
              alignItems: "center",
              gap: "8px",
            }}
          >
            <FileText size={18} color="var(--text-muted)" />
            {selectedJob
              ? `${selectedJob} Execution History`
              : "Global Execution History"}
          </h2>
          <span style={{ fontSize: "13px", color: "var(--text-muted)" }}>
            {displayedLogs.length} records
          </span>
        </div>

        <div style={{ flex: 1, overflow: "auto" }}>
          <table
            className="holdings-table"
            style={{ width: "100%", borderCollapse: "collapse" }}
          >
            <thead
              style={{
                position: "sticky",
                top: 0,
                background: "var(--surface)",
                zIndex: 10,
              }}
            >
              <tr>
                <th
                  style={{
                    padding: "16px 24px",
                    textAlign: "left",
                    fontSize: "12px",
                    color: "var(--text-muted)",
                    fontWeight: 500,
                    borderBottom: "1px solid rgba(255,255,255,0.05)",
                  }}
                >
                  STATUS
                </th>
                <th
                  style={{
                    padding: "16px 24px",
                    textAlign: "left",
                    fontSize: "12px",
                    color: "var(--text-muted)",
                    fontWeight: 500,
                    borderBottom: "1px solid rgba(255,255,255,0.05)",
                  }}
                >
                  JOB NAME
                </th>
                <th
                  style={{
                    padding: "16px 24px",
                    textAlign: "left",
                    fontSize: "12px",
                    color: "var(--text-muted)",
                    fontWeight: 500,
                    borderBottom: "1px solid rgba(255,255,255,0.05)",
                  }}
                >
                  STARTED AT
                </th>
                <th
                  style={{
                    padding: "16px 24px",
                    textAlign: "left",
                    fontSize: "12px",
                    color: "var(--text-muted)",
                    fontWeight: 500,
                    borderBottom: "1px solid rgba(255,255,255,0.05)",
                  }}
                >
                  DURATION
                </th>
                <th
                  style={{
                    padding: "16px 24px",
                    textAlign: "left",
                    fontSize: "12px",
                    color: "var(--text-muted)",
                    fontWeight: 500,
                    borderBottom: "1px solid rgba(255,255,255,0.05)",
                  }}
                >
                  MESSAGE
                </th>
                <th
                  style={{
                    padding: "16px 24px",
                    textAlign: "right",
                    fontSize: "12px",
                    color: "var(--text-muted)",
                    fontWeight: 500,
                    borderBottom: "1px solid rgba(255,255,255,0.05)",
                  }}
                >
                  ACTIONS
                </th>
              </tr>
            </thead>
            <tbody>
              {displayedLogs.map((log) => {
                let duration = "-";
                if (log.completed_at) {
                  const ms =
                    new Date(log.completed_at) - new Date(log.started_at);
                  duration = `${(ms / 1000).toFixed(1)}s`;
                }

                // Truncate message
                const shortMessage = log.message
                  ? log.message.length > 60
                    ? log.message.substring(0, 60) + "..."
                    : log.message
                  : "-";

                return (
                  <tr
                    key={log.id}
                    onClick={() => setSelectedLog(log)}
                    style={{
                      cursor: "pointer",
                      transition: "background 0.2s",
                      borderBottom: "1px solid rgba(255,255,255,0.02)",
                    }}
                    onMouseEnter={(e) =>
                      (e.currentTarget.style.background =
                        "rgba(255,255,255,0.02)")
                    }
                    onMouseLeave={(e) =>
                      (e.currentTarget.style.background = "transparent")
                    }
                  >
                    <td style={{ padding: "16px 24px" }}>
                      <span
                        className={`status-badge ${log.status.toLowerCase()}`}
                        style={{
                          padding: "4px 8px",
                          borderRadius: "4px",
                          fontSize: "12px",
                          fontWeight: 500,
                          background:
                            log.status === "SUCCESS"
                              ? "var(--accent-green-dim)"
                              : log.status === "FAILED"
                                ? "var(--accent-red-dim)"
                                : "var(--accent-amber-dim)",
                          color:
                            log.status === "SUCCESS"
                              ? "var(--accent-green)"
                              : log.status === "FAILED"
                                ? "var(--accent-red)"
                                : "var(--accent-amber)",
                        }}
                      >
                        {log.status}
                      </span>
                    </td>
                    <td
                      style={{
                        padding: "16px 24px",
                        fontSize: "13px",
                        fontWeight: 500,
                      }}
                    >
                      {log.job_name || "Unknown Job"}
                    </td>
                    <td
                      style={{
                        padding: "16px 24px",
                        fontSize: "13px",
                        color: "var(--text-secondary)",
                      }}
                    >
                      {new Date(log.started_at).toLocaleString()}
                    </td>
                    <td
                      style={{
                        padding: "16px 24px",
                        fontSize: "13px",
                        color: "var(--text-secondary)",
                        fontFamily: "var(--font-mono)",
                      }}
                    >
                      {duration}
                    </td>
                    <td
                      style={{
                        padding: "16px 24px",
                        fontSize: "13px",
                        color: "var(--text-muted)",
                        fontFamily: "var(--font-mono)",
                      }}
                    >
                      {shortMessage}
                    </td>
                    <td style={{ padding: "16px 24px", textAlign: "right" }}>
                      <button
                        onClick={(e) => handleDeleteLog(log.id, e)}
                        style={{
                          background: "transparent",
                          border: "none",
                          color: "var(--text-muted)",
                          cursor: "pointer",
                          padding: "4px",
                        }}
                        onMouseEnter={(e) =>
                          (e.currentTarget.style.color = "var(--accent-red)")
                        }
                        onMouseLeave={(e) =>
                          (e.currentTarget.style.color = "var(--text-muted)")
                        }
                      >
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                );
              })}
              {displayedLogs.length === 0 && (
                <tr>
                  <td
                    colSpan="6"
                    style={{
                      padding: "48px",
                      textAlign: "center",
                      color: "var(--text-muted)",
                    }}
                  >
                    No execution logs found for {selectedJob || "any job"}.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Log Details Modal */}
      {selectedLog && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(0,0,0,0.6)",
            backdropFilter: "blur(4px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
          }}
          onClick={() => setSelectedLog(null)}
        >
          <div
            className="glass-panel"
            style={{
              width: "800px",
              maxWidth: "90vw",
              maxHeight: "85vh",
              display: "flex",
              flexDirection: "column",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                padding: "24px",
                borderBottom: "1px solid rgba(255,255,255,0.05)",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <div>
                <h3 style={{ fontSize: "18px", fontWeight: 600 }}>
                  Execution Details
                </h3>
                <div
                  style={{
                    fontSize: "13px",
                    color: "var(--text-muted)",
                    marginTop: "4px",
                  }}
                >
                  {selectedLog.job_name} •{" "}
                  {new Date(selectedLog.started_at).toLocaleString()}
                </div>
              </div>
              <button
                onClick={() => setSelectedLog(null)}
                style={{
                  background: "transparent",
                  border: "none",
                  color: "var(--text-muted)",
                  cursor: "pointer",
                }}
              >
                <X size={24} />
              </button>
            </div>
            <div style={{ padding: "24px", overflow: "auto", flex: 1 }}>
              <div
                style={{ display: "flex", gap: "24px", marginBottom: "24px" }}
              >
                <div>
                  <div
                    style={{
                      fontSize: "12px",
                      color: "var(--text-muted)",
                      marginBottom: "4px",
                    }}
                  >
                    Status
                  </div>
                  <span
                    style={{
                      padding: "4px 8px",
                      borderRadius: "4px",
                      fontSize: "12px",
                      fontWeight: 500,
                      background:
                        selectedLog.status === "SUCCESS"
                          ? "var(--accent-green-dim)"
                          : selectedLog.status === "FAILED"
                            ? "var(--accent-red-dim)"
                            : "var(--accent-amber-dim)",
                      color:
                        selectedLog.status === "SUCCESS"
                          ? "var(--accent-green)"
                          : selectedLog.status === "FAILED"
                            ? "var(--accent-red)"
                            : "var(--accent-amber)",
                    }}
                  >
                    {selectedLog.status}
                  </span>
                </div>
                <div>
                  <div
                    style={{
                      fontSize: "12px",
                      color: "var(--text-muted)",
                      marginBottom: "4px",
                    }}
                  >
                    Job ID
                  </div>
                  <div
                    style={{ fontSize: "13px", fontFamily: "var(--font-mono)" }}
                  >
                    {selectedLog.id}
                  </div>
                </div>
              </div>

              <div
                style={{
                  fontSize: "12px",
                  color: "var(--text-muted)",
                  marginBottom: "8px",
                }}
              >
                Log Output
              </div>
              <pre
                style={{
                  background: "#0D1117",
                  padding: "16px",
                  borderRadius: "8px",
                  border: "1px solid rgba(255,255,255,0.05)",
                  color:
                    selectedLog.status === "FAILED"
                      ? "var(--accent-red)"
                      : "#E6EDF3",
                  fontFamily: "var(--font-mono)",
                  fontSize: "13px",
                  lineHeight: "1.5",
                  overflowX: "auto",
                  whiteSpace: "pre-wrap",
                }}
              >
                {selectedLog.message || "No log output recorded."}
              </pre>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
