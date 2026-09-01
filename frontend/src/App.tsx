import { Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { AppLayout } from "./components/layout/AppLayout";
import { LoginPage } from "./pages/LoginPage";
import { DashboardPage } from "./pages/DashboardPage";
import { SalesPage } from "./pages/SalesPage";
import { SalesmanDetailPage } from "./pages/SalesmanDetailPage";
import { CustomersPage } from "./pages/CustomersPage";
import { CustomerDetailPage } from "./pages/CustomerDetailPage";
import { ItemsPage } from "./pages/ItemsPage";
import { ItemDetailPage } from "./pages/ItemDetailPage";
import { OperationsPage } from "./pages/OperationsPage";
import { AiQualityPage } from "./pages/AiQualityPage";
import { InsightsPage } from "./pages/InsightsPage";
import { DataHealthPage } from "./pages/DataHealthPage";

function RequireAuth({ children }: { children: JSX.Element }) {
  const { session } = useAuth();
  if (!session) return <Navigate to="/login" replace />;
  return children;
}

function RootRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        element={
          <RequireAuth>
            <AppLayout />
          </RequireAuth>
        }
      >
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/sales" element={<SalesPage />} />
        <Route path="/salesmen/:id" element={<SalesmanDetailPage />} />
        <Route path="/customers" element={<CustomersPage />} />
        <Route path="/customers/:id" element={<CustomerDetailPage />} />
        <Route path="/items" element={<ItemsPage />} />
        <Route path="/items/:id" element={<ItemDetailPage />} />
        <Route path="/operations" element={<OperationsPage />} />
        <Route path="/ai-quality" element={<AiQualityPage />} />
        <Route path="/insights" element={<InsightsPage />} />
        <Route path="/data-health" element={<DataHealthPage />} />
      </Route>
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}

export function App() {
  return (
    <AuthProvider>
      <RootRoutes />
    </AuthProvider>
  );
}
