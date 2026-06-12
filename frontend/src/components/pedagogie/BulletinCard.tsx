import { Download } from "lucide-react";

import { MentionBadge } from "@/components/pedagogie/MentionBadge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { formatStatutCompetence } from "@/lib/pedagogie-utils";
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
                <span>Moy. {bulletin.moyenne_generale?.toFixed(2) ?? "—"}</span>
                <span>
                  Rang {bulletin.rang ?? "—"}/{bulletin.effectif_classe ?? "—"}
                </span>
                <MentionBadge mention={bulletin.mention} />
              </>
            )}
            <Badge variant={statutMeta.variant}>{statutMeta.label}</Badge>
          </div>
          {isCompetences && bulletin.lignes && bulletin.lignes.length > 0 ? (
            <ul className="mt-3 space-y-1 text-sm">
              {bulletin.lignes.map((ligne) => (
                <li key={ligne.id} className="flex justify-between gap-2">
                  <span className="text-muted-foreground">
                    {matieresMap?.get(ligne.matiere_id) ?? "Domaine"}
                  </span>
                  <span className="font-medium">
                    {formatStatutCompetence(ligne.statut_competence)}
                  </span>
                </li>
              ))}
            </ul>
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
