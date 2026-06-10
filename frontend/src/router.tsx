import { Navigate, Outlet } from "react-router-dom";
import { createBrowserRouter } from "react-router-dom";

import { EtablissementLayout } from "@/components/etablissement/EtablissementLayout";
import { FinanceLayout } from "@/components/finance/FinanceLayout";
import { AppLayout } from "@/components/layout/AppLayout";
import { PlatformLayout } from "@/components/layout/PlatformLayout";
import { PedagogieLayout } from "@/components/pedagogie/PedagogieLayout";
import { getPostLoginRoute } from "@/lib/auth-routes";
import { ROUTES } from "@/lib/constants";
import { AdminLoginPage } from "@/pages/auth/AdminLoginPage";
import { LoginPage } from "@/pages/auth/LoginPage";
import { DashboardPage } from "@/pages/dashboard/DashboardPage";
import { AnneesPage } from "@/pages/etablissement/AnneesPage";
import { ClassesPage as EtablissementClassesPage } from "@/pages/etablissement/ClassesPage";
import { ClassesPage } from "@/pages/classes/ClassesPage";
import { HubDocumentairePage } from "@/pages/documents/HubDocumentairePage";
import { EnseignantsPage } from "@/pages/enseignants/EnseignantsPage";
import { PaiementsPage } from "@/pages/paiements/PaiementsPage";
import { RapportsPage } from "@/pages/rapports/RapportsPage";
import { ConfigNotationPage } from "@/pages/etablissement/ConfigNotationPage";
import { CyclesPage } from "@/pages/etablissement/CyclesPage";
import { MatieresPage } from "@/pages/etablissement/MatieresPage";
import { NiveauxPage } from "@/pages/etablissement/NiveauxPage";
import { PeriodesPage } from "@/pages/etablissement/PeriodesPage";
import { AbsencesPage } from "@/pages/eleves/AbsencesPage";
import { EleveDossierPage } from "@/pages/eleves/EleveDossierPage";
import { ElevesListPage } from "@/pages/eleves/ElevesListPage";
import { InscriptionPage } from "@/pages/eleves/InscriptionPage";
import { CaissePage } from "@/pages/finance/CaissePage";
import { DepensesPage } from "@/pages/finance/DepensesPage";
import { FraisScolairesPage } from "@/pages/finance/FraisScolairesPage";
import { ImpayesPage } from "@/pages/finance/ImpayesPage";
import { PaiementsPage as FinancePaiementsPage } from "@/pages/finance/PaiementsPage";
import { SalairesPage } from "@/pages/finance/SalairesPage";
import { TableauBordFinancierPage } from "@/pages/finance/TableauBordFinancierPage";
import { TransactionsPage } from "@/pages/finance/TransactionsPage";
import { BulletinsPage } from "@/pages/pedagogie/BulletinsPage";
import { HistoriqueNotesPage } from "@/pages/pedagogie/HistoriqueNotesPage";
import { ResultatsClassePage } from "@/pages/pedagogie/ResultatsClassePage";
import { SaisieNotesPage } from "@/pages/pedagogie/SaisieNotesPage";
import { AbonnementsPage } from "@/pages/platform/AbonnementsPage";
import { AuditLogsPage } from "@/pages/platform/AuditLogsPage";
import { FacturationPage } from "@/pages/platform/FacturationPage";
import { NotificationsPage } from "@/pages/platform/NotificationsPage";
import { PlansPage } from "@/pages/platform/PlansPage";
import { PlatformDashboardPage } from "@/pages/platform/PlatformDashboardPage";
import { StatistiquesPage } from "@/pages/platform/StatistiquesPage";
import { TenantCreatePage } from "@/pages/platform/TenantCreatePage";
import { TenantUtilisateursPage } from "@/pages/platform/TenantUtilisateursPage";
import { TenantsListPage } from "@/pages/platform/TenantsListPage";
import { ProfilPage } from "@/pages/utilisateurs/ProfilPage";
import { UtilisateursListPage } from "@/pages/utilisateurs/UtilisateursListPage";
import { useAuthStore } from "@/stores/authStore";

function LoginPageGate(): React.JSX.Element {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const role = useAuthStore((s) => s.user?.role);
  if (isAuthenticated) {
    return <Navigate to={getPostLoginRoute(role)} replace />;
  }
  return <LoginPage />;
}

function AdminLoginPageGate(): React.JSX.Element {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const role = useAuthStore((s) => s.user?.role);
  if (isAuthenticated) {
    return <Navigate to={getPostLoginRoute(role)} replace />;
  }
  return <AdminLoginPage />;
}

function TenantRoute(): React.JSX.Element {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const role = useAuthStore((s) => s.user?.role);
  if (!isAuthenticated) {
    return <Navigate to={ROUTES.login} replace />;
  }
  if (role === "platform_owner") {
    return <Navigate to={ROUTES.platformDashboard} replace />;
  }
  return <Outlet />;
}

function PlatformRoute(): React.JSX.Element {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const role = useAuthStore((s) => s.user?.role);
  if (!isAuthenticated) {
    return <Navigate to={ROUTES.adminLogin} replace />;
  }
  if (role !== "platform_owner") {
    return <Navigate to={ROUTES.dashboard} replace />;
  }
  return <Outlet />;
}

export const router = createBrowserRouter([
  { path: ROUTES.login, element: <LoginPageGate /> },
  { path: ROUTES.adminLogin, element: <AdminLoginPageGate /> },
  {
    path: "/",
    element: <TenantRoute />,
    children: [
      {
        element: <AppLayout />,
        children: [
          { id: "app-index", index: true, element: <Navigate to="/dashboard" replace /> },
          { id: "dashboard", path: "dashboard", element: <DashboardPage /> },

          {
            id: "etablissement",
            path: "etablissement",
            element: <EtablissementLayout />,
            children: [
              {
                id: "etablissement-index",
                index: true,
                element: <Navigate to="annees" replace />,
              },
              { id: "etablissement-annees", path: "annees", element: <AnneesPage /> },
              { id: "etablissement-periodes", path: "periodes", element: <PeriodesPage /> },
              { id: "etablissement-cycles", path: "cycles", element: <CyclesPage /> },
              { id: "etablissement-niveaux", path: "niveaux", element: <NiveauxPage /> },
              {
                id: "etablissement-classes",
                path: "classes",
                element: <EtablissementClassesPage />,
              },
              { id: "etablissement-matieres", path: "matieres", element: <MatieresPage /> },
              {
                id: "etablissement-config-notation",
                path: "config-notation",
                element: <ConfigNotationPage />,
              },
            ],
          },

          { id: "eleves-inscrire", path: "eleves/inscrire", element: <InscriptionPage /> },
          { id: "eleves-absences", path: "eleves/absences", element: <AbsencesPage /> },
          {
            id: "eleves-dossier",
            path: "eleves/:eleveId/dossier",
            element: <EleveDossierPage />,
          },
          { id: "eleves", path: "eleves", element: <ElevesListPage /> },

          { id: "enseignants", path: "enseignants", element: <EnseignantsPage /> },
          { id: "classes", path: "classes", element: <ClassesPage /> },
          { id: "absences", path: "absences", element: <AbsencesPage /> },
          { id: "paiements", path: "paiements", element: <PaiementsPage /> },
          { id: "documents", path: "documents", element: <HubDocumentairePage /> },

          {
            id: "pedagogie",
            path: "pedagogie",
            element: <PedagogieLayout />,
            children: [
              { id: "pedagogie-index", index: true, element: <Navigate to="notes" replace /> },
              { id: "pedagogie-notes", path: "notes", element: <SaisieNotesPage /> },
              { id: "pedagogie-bulletins", path: "bulletins", element: <BulletinsPage /> },
              { id: "pedagogie-resultats", path: "resultats", element: <ResultatsClassePage /> },
              {
                id: "pedagogie-historique",
                path: "historique",
                element: <HistoriqueNotesPage />,
              },
            ],
          },

          {
            id: "finance",
            path: "finance",
            element: <FinanceLayout />,
            children: [
              { id: "finance-index", index: true, element: <Navigate to="paiements" replace /> },
              {
                id: "finance-paiements",
                path: "paiements",
                element: <FinancePaiementsPage />,
              },
              { id: "finance-frais", path: "frais", element: <FraisScolairesPage /> },
              { id: "finance-impayes", path: "impayes", element: <ImpayesPage /> },
              { id: "finance-transactions", path: "transactions", element: <TransactionsPage /> },
              { id: "finance-depenses", path: "depenses", element: <DepensesPage /> },
              { id: "finance-salaires", path: "salaires", element: <SalairesPage /> },
              { id: "finance-caisse", path: "caisse", element: <CaissePage /> },
              {
                id: "finance-tableau-bord",
                path: "tableau-bord",
                element: <TableauBordFinancierPage />,
              },
            ],
          },

          { id: "rapports", path: "rapports", element: <RapportsPage /> },

          {
            id: "reporting-legacy",
            path: "reporting/*",
            element: <Navigate to={ROUTES.rapports} replace />,
          },

          { id: "utilisateurs", path: "utilisateurs", element: <UtilisateursListPage /> },
          { id: "profil", path: "profil", element: <ProfilPage /> },
        ],
      },
    ],
  },
  {
    path: ROUTES.platformDashboard,
    element: <PlatformRoute />,
    children: [
      {
        element: <PlatformLayout />,
        children: [
          { index: true, element: <PlatformDashboardPage /> },
          { path: "tenants", element: <TenantsListPage /> },
          { path: "tenants/nouveau", element: <TenantCreatePage /> },
          {
            path: "tenants/:tenantId/utilisateurs",
            element: <TenantUtilisateursPage />,
          },
          { path: "abonnements", element: <AbonnementsPage /> },
          { path: "facturation", element: <FacturationPage /> },
          { path: "notifications", element: <NotificationsPage /> },
          { path: "statistiques", element: <StatistiquesPage /> },
          { path: "plans", element: <PlansPage /> },
          { path: "audit", element: <AuditLogsPage /> },
          { path: "profil", element: <ProfilPage /> },
        ],
      },
    ],
  },
  {
    path: "*",
    element: (
      <Navigate
        to={
          useAuthStore.getState().isAuthenticated
            ? getPostLoginRoute(useAuthStore.getState().user?.role)
            : ROUTES.login
        }
        replace
      />
    ),
  },
]);
