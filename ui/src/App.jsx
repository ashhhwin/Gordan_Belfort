// No changes, just replacing with same content.
import React, { Component } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Toaster } from "react-hot-toast";
import { useStore } from "./store";
import AuthScreen from "./components/auth/AuthScreen";
import Sidebar from "./components/layout/Sidebar";
import TopBar from "./components/layout/TopBar";
import Portfolio from "./pages/Portfolio";
import Market from "./pages/Market";
import Screener from "./pages/Screener";
import Options from "./pages/Options";
import Analytics from "./pages/Analytics";
import Watchlist from "./pages/Watchlist";
import Alerts from "./pages/Alerts";
import News from "./pages/News";
import Settings from "./pages/Settings";
import Assistant from "./pages/Assistant";
import SyncJobs from "./pages/SyncJobs";
import DatabaseExplorer from "./pages/DatabaseExplorer";

function AppShell() {
  return (
    <>
      <Sidebar />
      <div className="main-wrapper">
        <TopBar />
        <Routes>
          <Route path="/" element={<Portfolio />} />
          <Route path="/market" element={<Market />} />
          <Route path="/screener" element={<Screener />} />
          <Route path="/options" element={<Options />} />
          <Route path="/analytics" element={<Analytics />} />
          <Route path="/watchlist" element={<Watchlist />} />
          <Route path="/alerts" element={<Alerts />} />
          <Route path="/news" element={<News />} />
          <Route path="/assistant" element={<Assistant />} />
          <Route path="/sync-jobs" element={<SyncJobs />} />
          <Route path="/database" element={<DatabaseExplorer />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </div>
    </>
  );
}

class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("ErrorBoundary caught an error", error, errorInfo);
    this.setState({ errorInfo });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            padding: 40,
            background: "#111",
            color: "red",
            minHeight: "100vh",
          }}
        >
          <h2>Something went wrong.</h2>
          <pre style={{ color: "pink", whiteSpace: "pre-wrap" }}>
            {this.state.error && this.state.error.toString()}
            <br />
            {this.state.errorInfo && this.state.errorInfo.componentStack}
          </pre>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  const isAuthenticated = useStore((s) => s.isAuthenticated);
  const initApp = useStore((s) => s.initApp);
  const syncLogs = useStore((s) => s.syncLogs);

  // If a job is actively running, poll every 2 seconds. Otherwise, relax to every 60 seconds.
  const isRunning =
    syncLogs?.length > 0 && syncLogs[0].status === "IN_PROGRESS";

  React.useEffect(() => {
    initApp();
    const pollRate = isRunning ? 2000 : 60000;
    const interval = setInterval(initApp, pollRate);
    return () => clearInterval(interval);
  }, [initApp, isRunning]);

  return (
    <BrowserRouter>
      <Toaster
        position="bottom-right"
        toastOptions={{
          style: {
            background: "var(--surface-2)",
            color: "var(--text-primary)",
            border: "1px solid var(--border-light)",
            fontFamily: "var(--font-sans)",
            fontSize: "13px",
          },
        }}
      />
      {isAuthenticated ? (
        <ErrorBoundary>
          <AppShell />
        </ErrorBoundary>
      ) : (
        <AuthScreen />
      )}
    </BrowserRouter>
  );
}
