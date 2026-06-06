import {
  Building2,
  ClipboardList,
  CreditCard,
  GraduationCap,
  LayoutDashboard,
  LogOut,
  School,
  Wallet,
} from "lucide-react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { ROLE_LABELS, ROUTES } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/authStore";
import type { RoleUtilisateur } from "@/types";

interface NavItem {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  roles: RoleUtilisateur[];
}

const TENANT_NAV_ITEMS: NavItem[] = [
  {
    to: ROUTES.dashboard,
    label: "Tableau de bord",
    icon: LayoutDashboard,
    roles: ["promoteur", "directeur", "secretaire", "comptable"],
  },
  {
    to: ROUTES.eleves,
    label: "Élèves",
    icon: GraduationCap,
    roles: ["promoteur", "directeur", "secretaire"],
  },
  {
    to: ROUTES.financePaiements,
    label: "Paiements",
    icon: Wallet,
    roles: ["promoteur", "secretaire", "comptable"],
  },
];

const PLATFORM_NAV_ITEMS: NavItem[] = [
  {
    to: ROUTES.platformDashboard,
    label: "Vue plateforme",
    icon: LayoutDashboard,
    roles: ["platform_owner"],
  },
  {
    to: ROUTES.platformTenants,
    label: "Tenants",
    icon: Building2,
    roles: ["platform_owner"],
  },
  {
    to: ROUTES.platformPlans,
    label: "Plans",
    icon: CreditCard,
    roles: ["platform_owner"],
  },
  {
    to: ROUTES.platformAudit,
    label: "Audit",
    icon: ClipboardList,
    roles: ["platform_owner"],
  },
];

export function AppLayout(): React.JSX.Element {
  const navigate = useNavigate();
  const { user, tenant, logout } = useAuthStore();

  const role = user?.role ?? "secretaire";
  const navSource = role === "platform_owner" ? PLATFORM_NAV_ITEMS : TENANT_NAV_ITEMS;
  const visibleNav = navSource.filter((item) => item.roles.includes(role));

  const handleLogout = async (): Promise<void> => {
    await logout();
    navigate(ROUTES.login);
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
          {visibleNav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
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
          ))}
        </nav>
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
          <Outlet />
        </main>
      </div>
    </div>
  );
}
