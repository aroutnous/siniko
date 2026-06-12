import { NavLink, Outlet } from "react-router-dom";

import { ROUTES } from "@/lib/constants";
import { cn } from "@/lib/utils";

const TABS = [
  { to: ROUTES.etablissementWizard, label: "Configuration" },
  { to: ROUTES.etablissementAnnees, label: "Années" },
  { to: ROUTES.etablissementPeriodes, label: "Périodes" },
  { to: ROUTES.classes, label: "Classes" },
  { to: ROUTES.salles, label: "Salles" },
  { to: ROUTES.etablissementMatieres, label: "Matières" },
] as const;

export function EtablissementLayout(): React.JSX.Element {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Gestion de l&apos;établissement</h1>
        <p className="text-sm text-muted-foreground">
          Structure scolaire, années, classes et configuration
        </p>
      </div>
      <nav className="flex flex-wrap gap-2 border-b border-border pb-2">
        {TABS.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            end
            className={({ isActive }) =>
              cn(
                "rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
                isActive
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )
            }
          >
            {tab.label}
          </NavLink>
        ))}
      </nav>
      <Outlet />
    </div>
  );
}
