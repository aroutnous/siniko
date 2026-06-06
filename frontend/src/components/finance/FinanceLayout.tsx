import { NavLink, Outlet } from "react-router-dom";

import { ROUTES } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { useFinanceAccess } from "@/hooks/useFinanceAccess";

const ALL_TABS = [
  { to: ROUTES.financePaiements, label: "Paiements", key: "canAccessPaiements" as const },
  { to: ROUTES.financeFrais, label: "Frais", key: "canAccessFrais" as const },
  { to: ROUTES.financeImpayes, label: "Impayés", key: "canAccessImpayes" as const },
  { to: ROUTES.financeTransactions, label: "Transactions", key: "canAccessTransactions" as const },
  { to: ROUTES.financeDepenses, label: "Dépenses", key: "canAccessDepenses" as const },
  { to: ROUTES.financeSalaires, label: "Salaires", key: "canAccessSalaires" as const },
  { to: ROUTES.financeCaisse, label: "Caisse", key: "canAccessCaisse" as const },
  { to: ROUTES.financeTableauBord, label: "Tableau de bord", key: "canAccessTableauBord" as const },
];

export function FinanceLayout(): React.JSX.Element {
  const access = useFinanceAccess();
  const tabs = ALL_TABS.filter((tab) => access[tab.key]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Comptabilité & Finance</h1>
        <p className="text-sm text-muted-foreground">
          Paiements, frais, caisse et reporting financier
        </p>
      </div>
      <nav className="flex flex-wrap gap-2 border-b border-border pb-2">
        {tabs.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
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
