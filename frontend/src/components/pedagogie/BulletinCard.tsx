import { Download } from "lucide-react";

import { MentionBadge } from "@/components/pedagogie/MentionBadge";
import { StatutCompetenceBadge } from "@/components/pedagogie/StatutCompetenceBadge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { formatDecimal } from "@/lib/pedagogie-utils";
import type { Bulletin, StatutBulletin } from "@/types";

const STATUT_CONFIG: Record<
  StatutBulletin,
  { variant: "muted" | "warning" | "success"; label: string }
> = {
  brouillon: { variant: "muted", label: "Brouillon" },
  valide: { variant: "warning", label: "Validé" },
  publie: { variant: "success", label: "Publié" },
};

interface BulletinCardProps {
  eleveNom: string;
  bulletin: Bulletin;
  matieresMap?: Map<string, string>;
  canValidate: boolean;
  canPublish: boolean;
  onValidate?: () => void;
  onPublish?: () => void;
  onDownload?: () => void;
  loading?: boolean;
}

export function BulletinCard({
  eleveNom,
  bulletin,
  matieresMap,
  canValidate,
  canPublish,
  onValidate,
  onPublish,
  onDownload,
  loading = false,
}: BulletinCardProps): React.JSX.Element {
  const statutMeta = STATUT_CONFIG[bulletin.statut];
  const isCompetences = bulletin.type_bulletin === "competences";

  return (
    <Card>
      <CardContent className="flex flex-wrap items-start justify-between gap-3 p-4">
        <div className="min-w-0 flex-1">
          <p className="font-medium">{eleveNom}</p>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            {isCompetences ? (
              <Badge variant="muted">Bulletin compétences</Badge>
            ) : (
              <>
                <span>Moy. {formatDecimal(bulletin.moyenne_generale)}</span>
                <span>
                  Rang {bulletin.rang ?? "—"}/{bulletin.effectif_classe ?? "—"}
                </span>
                <MentionBadge mention={bulletin.mention} />
              </>
            )}
            <Badge variant={statutMeta.variant}>{statutMeta.label}</Badge>
          </div>
          {isCompetences && bulletin.lignes && bulletin.lignes.length > 0 ? (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="pb-2 pr-4 font-medium">Domaine de compétence</th>
                    <th className="pb-2 font-medium">Statut</th>
                  </tr>
                </thead>
                <tbody>
                  {bulletin.lignes.map((ligne) => (
                    <tr key={ligne.id} className="border-b border-border/60 last:border-0">
                      <td className="py-2 pr-4">
                        {matieresMap?.get(ligne.matiere_id) ?? "Domaine"}
                      </td>
                      <td className="py-2">
                        <StatutCompetenceBadge statut={ligne.statut_competence} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
          {isCompetences && bulletin.appreciation_generale ? (
            <p className="mt-3 text-sm text-muted-foreground">
              <span className="font-medium text-foreground">Appréciation générale :</span>{" "}
              {bulletin.appreciation_generale}
            </p>
          ) : null}
        </div>
        <div className="flex gap-2">
          {bulletin.statut === "brouillon" && canValidate ? (
            <Button size="sm" disabled={loading} onClick={onValidate}>
              Valider
            </Button>
          ) : null}
          {bulletin.statut === "valide" && canPublish ? (
            <Button size="sm" disabled={loading} onClick={onPublish}>
              Publier
            </Button>
          ) : null}
          {bulletin.statut === "publie" ? (
            <Button size="sm" variant="outline" disabled={loading} onClick={onDownload}>
              <Download className="mr-2 h-4 w-4" />
              PDF
            </Button>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
