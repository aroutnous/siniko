import { Badge } from "@/components/ui/badge";
import type { ModePaiement } from "@/types";

const CONFIG: Record<ModePaiement, { variant: "default" | "success" | "warning" | "muted"; label: string }> = {
  especes: { variant: "success", label: "Espèces" },
  mobile_money: { variant: "default", label: "Mobile Money" },
  virement: { variant: "warning", label: "Virement" },
  cheque: { variant: "muted", label: "Chèque" },
};

interface ModePaiementBadgeProps {
  mode: ModePaiement | string;
}

export function ModePaiementBadge({ mode }: ModePaiementBadgeProps): React.JSX.Element {
  const key = mode as ModePaiement;
  const meta = CONFIG[key] ?? { variant: "muted" as const, label: mode };
  return <Badge variant={meta.variant}>{meta.label}</Badge>;
}
