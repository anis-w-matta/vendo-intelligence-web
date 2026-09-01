import { Outlet } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { useAuth } from "../../context/AuthContext";

export function AppLayout() {
  const { session, signOut } = useAuth();
  return (
    <div className="app-shell">
      <Sidebar userName={session?.name ?? ""} onSignOut={signOut} />
      <div className="main-col">
        <main id="main-content" className="page-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
