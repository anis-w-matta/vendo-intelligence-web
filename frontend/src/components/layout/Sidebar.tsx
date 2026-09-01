import { NavLink } from "react-router-dom";

const NAV_ITEMS = [
  { to: "/dashboard", label: "Command Center", icon: "◧" },
  { to: "/sales", label: "Sales Performance", icon: "▲" },
  { to: "/customers", label: "Customers", icon: "◍" },
  { to: "/items", label: "Items", icon: "▦" },
  { to: "/operations", label: "Operations", icon: "◷" },
  { to: "/ai-quality", label: "AI Quality", icon: "✓" },
  { to: "/insights", label: "Insights", icon: "✦" },
  { to: "/data-health", label: "Data Health", icon: "⛁" },
];

export function Sidebar({ userName, onSignOut }: { userName: string; onSignOut: () => void }) {
  return (
    <nav className="sidebar" aria-label="Primary">
      <div className="brand">
        <span className="brand-mark" aria-hidden="true">V</span>
        <span className="brand-text">VeNdO Intelligence</span>
      </div>
      {NAV_ITEMS.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}
        >
          <span className="nav-icon" aria-hidden="true">{item.icon}</span>
          <span className="nav-label">{item.label}</span>
        </NavLink>
      ))}
      <div className="sidebar-footer">
        <div className="nav-label">{userName}</div>
        <button type="button" className="nav-link nav-label" style={{ width: "100%", textAlign: "left", marginTop: 4 }} onClick={onSignOut}>
          Sign out
        </button>
      </div>
    </nav>
  );
}
