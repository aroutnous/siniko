import { Badge } from "@/components/ui/badge";
import {
  formatStatutCompetence,
  statutCompetenceBadgeVariant,
} from "@/lib/pedagogie-utils";

interface StatutCompetenceBadgeProps {
  statut: string | null | undefined;
}

export function StatutCompetenceBadge({
  statut,
}: StatutCompetenceBadgeProps): React.JSX.Element {
  return (
    <Badge variant={statutCompetenceBadgeVariant(statut)}>
      {formatStatutCompetence(statut)}
    </Badge>
  );
}
