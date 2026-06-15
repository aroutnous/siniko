import { Badge } from "@/components/ui/badge";
import type { StatutEleve } from "@/types";

const CONFIG: Record<
  StatutEleve,
  { variant: "success" | "warning" | "destructive"; label: string }
> = {
  actif: { variant: "success", label: "Actif" },
  transfere: { variant: "warning", label: "Transféré" },
  exclu: { variant: "destructive", label: "Archivé" },
};

interface EleveStatutBadgeProps {
  statut: StatutEleve | string;
}

export function EleveStatutBadge({ statut }: EleveStatutBadgeProps): React.JSX.Element {
  const key = statut as StatutEleve;
  if (key in CONFIG) {
    const meta = CONFIG[key];
    return <Badge variant={meta.variant}>{meta.label}</Badge>;
  }
  return <Badge variant="muted">{statut}</Badge>;
}
