import {
  BarChart3,
  Bell,
  Building2,
  ClipboardList,
  CreditCard,
  FileText,
  LayoutDashboard,
  LogOut,
  ListTree,
  Receipt,
  Shield,
  User,
} from "lucide-react";
import { NavLink, useNavigate } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { getPostLogoutRoute } from "@/lib/auth-routes";
import { ROLE_LABELS, ROUTES } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/authStore";

const PLATFORM_NAV_ITEMS = [
  { to: ROUTES.platformDashboard, label: "Dashboard", icon: LayoutDashboard },
  { to: ROUTES.platformTenants, label: "Tenants", icon: Building2 },
  { to: ROUTES.platformAbonnements, label: "Abonnements", icon: CreditCard },
  { to: ROUTES.platformFacturation, label: "Facturation", icon: Receipt },
  { to: ROUTES.platformNotifications, label: "Notifications", icon: Bell },
  { to: ROUTES.platformStatistiques, label: "Statistiques", icon: BarChart3 },
  { to: ROUTES.platformPlans, label: "Plans", icon: FileText },
  { to: ROUTES.platformValeursSysteme, label: "Valeurs système", icon: ListTree },
  { to: ROUTES.platformAudit, label: "Audit", icon: ClipboardList },
] as const;

export function PlatformSidebar(): React.JSX.Element {
  const navigate = useNavigate();
  const { user, logout } = useAuthStore();

  const handleLogout = async (): Promise<void> => {
    const role = user?.role;
    await logout();
    navigate(getPostLogoutRoute(role));
  };

  return (
    <aside className="flex w-64 flex-col border-r border-border bg-background">
      <div className="flex items-center gap-2 border-b border-border px-6 py-5">
        <Shield className="h-7 w-7 text-primary" />
        <div>
          <p className="font-bold text-primary">KALANKO</p>
          <p className="text-xs text-muted-foreground">Administration plateforme</p>
        </div>
      </div>
      <nav className="flex-1 space-y-1 overflow-y-auto p-4">
        {PLATFORM_NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === ROUTES.platformDashboard}
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
      <div className="border-t border-border p-4">
        <div className="mb-3 px-3">
          <p className="truncate text-sm font-medium">
            {user ? `${user.prenom} ${user.nom}` : "Administrateur"}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {ROLE_LABELS.platform_owner}
          </p>
        </div>
        <NavLink
          to="/platform/profil"
          className={({ isActive }) =>
            cn(
              "mb-2 flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              isActive
                ? "bg-primary text-primary-foreground"
                : "text-foreground hover:bg-muted",
            )
          }
        >
          <User className="h-4 w-4" />
          Mon profil
        </NavLink>
        <Button
          variant="outline"
          size="sm"
          className="w-full"
          onClick={() => void handleLogout()}
        >
          <LogOut className="mr-2 h-4 w-4" />
          Déconnexion
        </Button>
      </div>
    </aside>
  );
}
