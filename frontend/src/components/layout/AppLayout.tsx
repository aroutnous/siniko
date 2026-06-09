import {
  BarChart3,
  BookOpen,
  Building2,
  CalendarX,
  GraduationCap,
  LayoutDashboard,
  LogOut,
  School,
  User,
  UserCog,
  Wallet,
} from "lucide-react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";

import { TenantPermissionGuard } from "@/components/auth/TenantPermissionGuard";
import { Button } from "@/components/ui/button";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { useMenuAccess } from "@/hooks/useMenuAccess";
import { getPostLogoutRoute } from "@/lib/auth-routes";
import { ROLE_LABELS, ROUTES } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/authStore";

interface NavItem {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  show: boolean;
  end?: boolean;
}

export function AppLayout(): React.JSX.Element {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, tenant, logout, permissionsLoaded } = useAuthStore();
  const menuAccess = useMenuAccess();
  const role = user?.role ?? "secretaire";
  const navReady = permissionsLoaded && user !== null;

  const tenantNavItems: NavItem[] = [
    {
      to: ROUTES.dashboard,
      label: "Tableau de bord",
      icon: LayoutDashboard,
      show: true,
      end: true,
    },
    {
      to: ROUTES.etablissementAnnees,
      label: "Établissement",
      icon: Building2,
      show: menuAccess.showEtablissement,
    },
    {
      to: ROUTES.eleves,
      label: "Élèves",
      icon: GraduationCap,
      show: menuAccess.showEleves,
      end: true,
    },
    {
      to: ROUTES.elevesAbsences,
      label: "Absences",
      icon: CalendarX,
      show: menuAccess.showAbsences,
    },
    {
      to: ROUTES.pedagogieNotes,
      label: "Pédagogie",
      icon: BookOpen,
      show: menuAccess.showPedagogie,
    },
    {
      to: ROUTES.financePaiements,
      label: "Finance",
      icon: Wallet,
      show: menuAccess.showFinance,
    },
    {
      to: ROUTES.reportingTableauBord,
      label: "Reporting",
      icon: BarChart3,
      show: menuAccess.showReporting,
    },
    {
      to: ROUTES.utilisateurs,
      label: "Utilisateurs",
      icon: UserCog,
      show: menuAccess.showUtilisateurs,
      end: true,
    },
  ];

  const visibleNav = tenantNavItems.filter((item) => item.show);

  const handleLogout = async (): Promise<void> => {
    await logout();
    navigate(getPostLogoutRoute(role));
  };

  return (
    <div className="flex min-h-screen bg-muted/30">
      <aside className="flex w-64 flex-col border-r border-border bg-background">
        <div className="flex items-center gap-2 border-b border-border px-6 py-5">
          <School className="h-7 w-7 text-primary" />
          <div>
            <p className="font-bold text-primary">SINIKO</p>
            <p className="text-xs text-muted-foreground">Gestion scolaire</p>
          </div>
        </div>
        <nav className="flex-1 space-y-1 p-4">
          {!navReady ? (
            <LoadingSpinner label="Chargement du menu…" />
          ) : (
            visibleNav.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                    isActive
                      ? "bg-primary text-primary-foreground"
                      : "text-foreground hover:bg-muted",
                  )
                }
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </NavLink>
            ))
          )}
        </nav>
        <div className="border-t border-border p-4">
          <div className="mb-3 px-3">
            <p className="truncate text-sm font-medium">
              {user ? `${user.prenom} ${user.nom}` : "Utilisateur"}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {ROLE_LABELS[role] ?? role}
            </p>
          </div>
          <NavLink
            to={ROUTES.profil}
            end
            className={({ isActive }) =>
              cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-primary text-primary-foreground"
                  : "text-foreground hover:bg-muted",
              )
            }
          >
            <User className="h-4 w-4" />
            Mon profil
          </NavLink>
        </div>
      </aside>

      <div className="flex flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-border bg-background px-6 py-4">
          <div>
            <p className="text-sm font-medium">
              {user ? `${user.prenom} ${user.nom}` : "Utilisateur"}
            </p>
            <p className="text-xs text-muted-foreground">
              {ROLE_LABELS[role] ?? role}
              {tenant?.slug ? ` · ${tenant.slug}` : ""}
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => void handleLogout()}>
            <LogOut className="mr-2 h-4 w-4" />
            Déconnexion
          </Button>
        </header>
        <main className="flex-1 overflow-auto p-6">
          <TenantPermissionGuard>
            <Outlet key={location.pathname} />
          </TenantPermissionGuard>
        </main>
      </div>
    </div>
  );
}
