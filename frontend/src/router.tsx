import { Navigate, Outlet } from "react-router-dom";
import { createBrowserRouter } from "react-router-dom";

import { AppLayout } from "@/components/layout/AppLayout";
import { ROUTES } from "@/lib/constants";
import { LoginPage } from "@/pages/auth/LoginPage";
import { DashboardPage } from "@/pages/dashboard/DashboardPage";
import { AbsencesPage } from "@/pages/eleves/AbsencesPage";
import { EleveDossierPage } from "@/pages/eleves/EleveDossierPage";
import { ElevesListPage } from "@/pages/eleves/ElevesListPage";
import { InscriptionPage } from "@/pages/eleves/InscriptionPage";
import { FinanceLayout } from "@/components/finance/FinanceLayout";
import { CaissePage } from "@/pages/finance/CaissePage";
import { DepensesPage } from "@/pages/finance/DepensesPage";
import { FraisScolairesPage } from "@/pages/finance/FraisScolairesPage";
import { ImpayesPage } from "@/pages/finance/ImpayesPage";
import { PaiementsPage } from "@/pages/finance/PaiementsPage";
import { SalairesPage } from "@/pages/finance/SalairesPage";
import { TableauBordFinancierPage } from "@/pages/finance/TableauBordFinancierPage";
import { TransactionsPage } from "@/pages/finance/TransactionsPage";
import { AuditLogsPage } from "@/pages/platform/AuditLogsPage";
import { PlansPage } from "@/pages/platform/PlansPage";
import { PlatformDashboardPage } from "@/pages/platform/PlatformDashboardPage";
import { TenantCreatePage } from "@/pages/platform/TenantCreatePage";
import { TenantsListPage } from "@/pages/platform/TenantsListPage";
import { AnneesPage } from "@/pages/etablissement/AnneesPage";
import { ClassesPage } from "@/pages/etablissement/ClassesPage";
import { ConfigNotationPage } from "@/pages/etablissement/ConfigNotationPage";
import { CyclesPage } from "@/pages/etablissement/CyclesPage";
import { MatieresPage } from "@/pages/etablissement/MatieresPage";
import { NiveauxPage } from "@/pages/etablissement/NiveauxPage";
import { PeriodesPage } from "@/pages/etablissement/PeriodesPage";
import { EtablissementLayout } from "@/components/etablissement/EtablissementLayout";
import { PedagogieLayout } from "@/components/pedagogie/PedagogieLayout";
import { BulletinsPage } from "@/pages/pedagogie/BulletinsPage";
import { HistoriqueNotesPage } from "@/pages/pedagogie/HistoriqueNotesPage";
import { ResultatsClassePage } from "@/pages/pedagogie/ResultatsClassePage";
import { SaisieNotesPage } from "@/pages/pedagogie/SaisieNotesPage";
import { ReportingLayout } from "@/components/reporting/ReportingLayout";
import { ExportsPage } from "@/pages/reporting/ExportsPage";
import { ImpressionsPage } from "@/pages/reporting/ImpressionsPage";
import { StatistiquesPage } from "@/pages/reporting/StatistiquesPage";
import { TableauBordPage } from "@/pages/reporting/TableauBordPage";
import { ProfilPage } from "@/pages/utilisateurs/ProfilPage";
import { UtilisateursListPage } from "@/pages/utilisateurs/UtilisateursListPage";
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

function EstablishmentRoute(): React.JSX.Element {
  const role = useAuthStore((s) => s.user?.role);
  if (role !== "promoteur" && role !== "directeur") {
    return <Navigate to={ROUTES.dashboard} replace />;
  }
  return <Outlet />;
}

function PedagogieRoute(): React.JSX.Element {
  const role = useAuthStore((s) => s.user?.role);
  if (role !== "promoteur" && role !== "directeur" && role !== "secretaire") {
    return <Navigate to={ROUTES.dashboard} replace />;
  }
  return <Outlet />;
}

function FinanceRoute(): React.JSX.Element {
  const role = useAuthStore((s) => s.user?.role);
  if (
    role !== "promoteur" &&
    role !== "comptable" &&
    role !== "secretaire" &&
    role !== "directeur"
  ) {
    return <Navigate to={ROUTES.dashboard} replace />;
  }
  return <Outlet />;
}

function ReportingRoute(): React.JSX.Element {
  const role = useAuthStore((s) => s.user?.role);
  if (
    role !== "promoteur" &&
    role !== "directeur" &&
    role !== "comptable" &&
    role !== "secretaire"
  ) {
    return <Navigate to={ROUTES.dashboard} replace />;
  }
  return <Outlet />;
}

function UtilisateursRoute(): React.JSX.Element {
  const role = useAuthStore((s) => s.user?.role);
  if (role !== "promoteur") {
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
          { path: ROUTES.profil, element: <ProfilPage /> },
          { path: ROUTES.eleves, element: <ElevesListPage /> },
          { path: ROUTES.elevesAbsences, element: <AbsencesPage /> },
          { path: ROUTES.eleveDossier, element: <EleveDossierPage /> },
          { path: ROUTES.elevesInscrire, element: <InscriptionPage /> },
          {
            element: <FinanceRoute />,
            children: [
              {
                element: <FinanceLayout />,
                children: [
                  { path: ROUTES.financePaiements, element: <PaiementsPage /> },
                  { path: ROUTES.financeFrais, element: <FraisScolairesPage /> },
                  { path: ROUTES.financeImpayes, element: <ImpayesPage /> },
                  { path: ROUTES.financeTransactions, element: <TransactionsPage /> },
                  { path: ROUTES.financeDepenses, element: <DepensesPage /> },
                  { path: ROUTES.financeSalaires, element: <SalairesPage /> },
                  { path: ROUTES.financeCaisse, element: <CaissePage /> },
                  {
                    path: ROUTES.financeTableauBord,
                    element: <TableauBordFinancierPage />,
                  },
                ],
              },
            ],
          },
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
          {
            element: <EstablishmentRoute />,
            children: [
              {
                element: <EtablissementLayout />,
                children: [
                  { path: ROUTES.etablissementAnnees, element: <AnneesPage /> },
                  { path: ROUTES.etablissementPeriodes, element: <PeriodesPage /> },
                  { path: ROUTES.etablissementCycles, element: <CyclesPage /> },
                  { path: ROUTES.etablissementNiveaux, element: <NiveauxPage /> },
                  { path: ROUTES.etablissementClasses, element: <ClassesPage /> },
                  { path: ROUTES.etablissementMatieres, element: <MatieresPage /> },
                  {
                    path: ROUTES.etablissementConfigNotation,
                    element: <ConfigNotationPage />,
                  },
                ],
              },
            ],
          },
          {
            element: <PedagogieRoute />,
            children: [
              {
                element: <PedagogieLayout />,
                children: [
                  { path: ROUTES.pedagogieNotes, element: <SaisieNotesPage /> },
                  { path: ROUTES.pedagogieBulletins, element: <BulletinsPage /> },
                  { path: ROUTES.pedagogieResultats, element: <ResultatsClassePage /> },
                  { path: ROUTES.pedagogieHistorique, element: <HistoriqueNotesPage /> },
                ],
              },
            ],
          },
          {
            element: <UtilisateursRoute />,
            children: [{ path: ROUTES.utilisateurs, element: <UtilisateursListPage /> }],
          },
          {
            element: <ReportingRoute />,
            children: [
              {
                element: <ReportingLayout />,
                children: [
                  { path: ROUTES.reportingTableauBord, element: <TableauBordPage /> },
                  { path: ROUTES.reportingStatistiques, element: <StatistiquesPage /> },
                  { path: ROUTES.reportingExports, element: <ExportsPage /> },
                  { path: ROUTES.reportingImpressions, element: <ImpressionsPage /> },
                ],
              },
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
