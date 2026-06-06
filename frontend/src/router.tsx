import { Navigate, Outlet } from "react-router-dom";
import { createBrowserRouter } from "react-router-dom";

import { AppLayout } from "@/components/layout/AppLayout";
import { ROUTES } from "@/lib/constants";
import { LoginPage } from "@/pages/auth/LoginPage";
import { DashboardPage } from "@/pages/dashboard/DashboardPage";
import { ElevesListPage } from "@/pages/eleves/ElevesListPage";
import { InscriptionPage } from "@/pages/eleves/InscriptionPage";
import { PaiementsPage } from "@/pages/finance/PaiementsPage";
import { AuditLogsPage } from "@/pages/platform/AuditLogsPage";
import { PlansPage } from "@/pages/platform/PlansPage";
import { PlatformDashboardPage } from "@/pages/platform/PlatformDashboardPage";
import { TenantCreatePage } from "@/pages/platform/TenantCreatePage";
import { TenantsListPage } from "@/pages/platform/TenantsListPage";
import { useAuthStore } from "@/stores/authStore";

function PrivateRoute(): React.JSX.Element {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  if (!isAuthenticated) {
    return <Navigate to={ROUTES.login} replace />;
  }
  return <Outlet />;
}

function PublicRoute(): React.JSX.Element {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const role = useAuthStore((s) => s.user?.role);
  if (isAuthenticated) {
    return (
      <Navigate
        to={role === "platform_owner" ? ROUTES.platformDashboard : ROUTES.dashboard}
        replace
      />
    );
  }
  return <Outlet />;
}

function PlatformRoute(): React.JSX.Element {
  const role = useAuthStore((s) => s.user?.role);
  if (role !== "platform_owner") {
    return <Navigate to={ROUTES.dashboard} replace />;
  }
  return <Outlet />;
}

export const router = createBrowserRouter([
  {
    element: <PublicRoute />,
    children: [{ path: ROUTES.login, element: <LoginPage /> }],
  },
  {
    element: <PrivateRoute />,
    children: [
      {
        element: <AppLayout />,
        children: [
          { path: ROUTES.dashboard, element: <DashboardPage /> },
          { path: ROUTES.eleves, element: <ElevesListPage /> },
          { path: ROUTES.elevesInscrire, element: <InscriptionPage /> },
          { path: ROUTES.financePaiements, element: <PaiementsPage /> },
          {
            element: <PlatformRoute />,
            children: [
              { path: ROUTES.platformDashboard, element: <PlatformDashboardPage /> },
              { path: ROUTES.platformTenants, element: <TenantsListPage /> },
              { path: ROUTES.platformTenantsCreate, element: <TenantCreatePage /> },
              { path: ROUTES.platformPlans, element: <PlansPage /> },
              { path: ROUTES.platformAudit, element: <AuditLogsPage /> },
            ],
          },
        ],
      },
    ],
  },
  {
    path: "/",
    element: (
      <Navigate
        to={
          useAuthStore.getState().isAuthenticated
            ? useAuthStore.getState().user?.role === "platform_owner"
              ? ROUTES.platformDashboard
              : ROUTES.dashboard
            : ROUTES.login
        }
        replace
      />
    ),
  },
  { path: "*", element: <Navigate to={ROUTES.dashboard} replace /> },
]);
