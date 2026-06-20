import { NavLink } from "react-router-dom";
import {
  LayoutDashboard,
  TrendingUp,
  Search,
  Activity,
  BarChart2,
  Star,
  Bell,
  Newspaper,
  LogOut,
  Settings as SettingsIcon,
  Sparkles,
  Database,
} from "lucide-react";
import { useStore } from "../../store";

const NAV = [
  { icon: LayoutDashboard, label: "Portfolio", to: "/" },
  { icon: Sparkles, label: "Assistant", to: "/assistant" },
  { icon: TrendingUp, label: "Market", to: "/market" },
  { icon: Search, label: "Screener", to: "/screener" },
  { icon: Activity, label: "Options", to: "/options" },
  { icon: BarChart2, label: "Analytics", to: "/analytics" },
  { icon: Star, label: "Watchlist", to: "/watchlist" },
  { icon: Bell, label: "Alerts", to: "/alerts" },
  { icon: Newspaper, label: "News", to: "/news" },
  { icon: Activity, label: "Sync Jobs", to: "/sync-jobs" },
  { icon: Database, label: "Database", to: "/database" },
  { icon: SettingsIcon, label: "Settings", to: "/settings" },
];

export default function Sidebar() {
  const { logout, activeUser } = useStore();

  return (
    <aside className="sidebar">
      <div className="sidebar-logo" style={{ display: "none" }}></div>

      <nav className="sidebar-nav">
        {NAV.map(({ icon: Icon, label, to }) => (
          <NavLink
            key={to}
            to={to}
            end={to === "/"}
            className={({ isActive }) =>
              `sidebar-item ${isActive ? "active" : ""}`
            }
          >
            <span className="sidebar-item-icon">
              <Icon size={18} strokeWidth={1.8} />
            </span>
            <span className="sidebar-item-label">{label}</span>
          </NavLink>
        ))}
      </nav>

      <div className="sidebar-bottom">
        <div className="sidebar-avatar">
          <div
            className="avatar-circle"
            style={{
              background:
                activeUser?.color ||
                "linear-gradient(135deg, var(--accent-blue), var(--accent-purple))",
            }}
          >
            {activeUser?.initials || "??"}
          </div>
          <div className="avatar-info">
            <div className="avatar-name">{activeUser?.name || "User"}</div>
            <div className="avatar-role">
              {activeUser?.role === "admin" ? "Administrator" : "Family Member"}
            </div>
          </div>
        </div>
        <button
          onClick={logout}
          className="sidebar-item"
          style={{
            width: "100%",
            border: "none",
            background: "none",
            cursor: "pointer",
            marginTop: 4,
          }}
          title="Lock"
        >
          <span className="sidebar-item-icon">
            <LogOut size={17} strokeWidth={1.8} />
          </span>
          <span className="sidebar-item-label">Lock Account</span>
        </button>
      </div>
    </aside>
  );
}
