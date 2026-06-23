import {
  BarChart3,
  BookMarked,
  BookOpen,
  Building2,
  CalendarX,
  CreditCard,
  FileText,
  GraduationCap,
  LayoutDashboard,
  LogOut,
  User,
  UserCog,
  Users,
  Wallet,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";

import { TenantPermissionGuard } from "@/components/auth/TenantPermissionGuard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { useMenuAccess } from "@/hooks/useMenuAccess";
import { api } from "@/lib/api";
import { getPostLogoutRoute } from "@/lib/auth-routes";
import { ROLE_LABELS, ROUTES } from "@/lib/constants";
import { ETABLISSEMENT_API } from "@/lib/etablissement-api";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/authStore";
import type { AnneeScolaire } from "@/types";

interface NavItem {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  show: boolean;
  end?: boolean;
  badge?: string;
  isActive?: (pathname: string) => boolean;
}

export function AppLayout(): React.JSX.Element {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, tenant, logout, permissionsLoaded } = useAuthStore();
  const menuAccess = useMenuAccess();
  const role = user?.role ?? "secretaire";
  const navReady = permissionsLoaded && user !== null;

  const { data: anneeActive, isFetched: anneeFetched } = useQuery({
    queryKey: ["annee-active"],
    queryFn: async () => {
      const { data } = await api.get<AnneeScolaire>(ETABLISSEMENT_API.anneeActive);
      return data;
    },
    retry: false,
    enabled: menuAccess.showEtablissement,
  });

  const NAV_ITEMS: NavItem[] = [
    {
      to: ROUTES.dashboard,
      label: "Tableau de bord",
      icon: LayoutDashboard,
      show: true,
      end: true,
    },
    {
      to: "/etablissement",
      label: "Établissement",
      icon: Building2,
      show: menuAccess.showEtablissement,
      badge: anneeFetched && !anneeActive ? "À configurer" : undefined,
      isActive: (pathname) =>
        pathname.startsWith("/etablissement") &&
        !pathname.startsWith(ROUTES.etablissementMatieres),
    },
    {
      to: ROUTES.etablissementMatieres,
      label: "Matières",
      icon: BookMarked,
      show: menuAccess.can.etablissementConfigurer,
      end: true,
    },
    {
      to: ROUTES.eleves,
      label: "Élèves",
      icon: GraduationCap,
      show: menuAccess.showEleves,
      end: true,
    },
    {
      to: ROUTES.enseignants,
      label: "Enseignants",
      icon: Users,
      show: menuAccess.showEnseignants,
      end: true,
    },
    {
      to: ROUTES.absences,
      label: "Absences",
      icon: CalendarX,
      show: menuAccess.showAbsences,
      end: true,
    },
    {
      to: ROUTES.pedagogieNotes,
      label: "Pédagogie",
      icon: BookOpen,
      show: menuAccess.showPedagogie,
    },
    {
      to: ROUTES.paiements,
      label: "Paiements",
      icon: CreditCard,
      show: menuAccess.showPaiements,
      end: true,
    },
    {
      to: ROUTES.financeFrais,
      label: "Finance",
      icon: Wallet,
      show: menuAccess.showFinance,
    },
    {
      to: ROUTES.documents,
      label: "Hub Documentaire",
      icon: FileText,
      show: menuAccess.showDocuments,
      end: true,
    },
    {
      to: ROUTES.rapports,
      label: "Rapports",
      icon: BarChart3,
      show: menuAccess.showRapports,
      end: true,
    },
    {
      to: ROUTES.utilisateurs,
      label: "Utilisateurs",
      icon: UserCog,
      show: menuAccess.showUtilisateurs,
      end: true,
    },
  ];

  const visibleNav = NAV_ITEMS.filter((item) => item.show);

  const handleLogout = async (): Promise<void> => {
    await logout();
    navigate(getPostLogoutRoute(role));
  };

  return (
    <div className="flex min-h-screen bg-muted/30">
      <aside className="flex w-64 flex-col border-r border-border bg-background">
        <div className="flex items-center gap-2 border-b border-border px-6 py-5">
          <Building2 className="h-7 w-7 text-primary" />
          <div>
            <p className="font-bold text-primary">KALANKO</p>
            <p className="text-xs text-muted-foreground">Gestion scolaire</p>
          </div>
        </div>
        <nav className="flex-1 space-y-1 overflow-y-auto p-4">
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
                    (item.isActive ? item.isActive(location.pathname) : isActive)
                      ? "bg-primary text-primary-foreground"
                      : "text-foreground hover:bg-muted",
                  )
                }
              >
                <item.icon className="h-4 w-4 shrink-0" />
                <span className="flex-1 truncate">{item.label}</span>
                {item.badge ? (
                  <Badge variant="warning" className="ml-auto text-[10px]">
                    {item.badge}
                  </Badge>
                ) : null}
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
