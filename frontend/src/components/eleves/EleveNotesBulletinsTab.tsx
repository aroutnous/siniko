import { useQuery } from "@tanstack/react-query";
import { Eye } from "lucide-react";
import { useMemo, useState } from "react";

import { MentionBadge } from "@/components/pedagogie/MentionBadge";
import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { api } from "@/lib/api";
import { ETABLISSEMENT_API } from "@/lib/etablissement-api";
import { PEDAGOGIE_API } from "@/lib/pedagogie-api";
import { formatDecimal, formatStatutCompetence } from "@/lib/pedagogie-utils";
import type { Bulletin, Matiere, Note, Periode, SequenceEvaluation } from "@/types";

const STATUT_LABELS: Record<Bulletin["statut"], string> = {
  brouillon: "Brouillon",
  valide: "Validé",
  publie: "Publié",
};

interface EleveNotesBulletinsTabProps {
  eleveId: string;
  eleveNom: string;
}

export function EleveNotesBulletinsTab({
  eleveId,
  eleveNom,
}: EleveNotesBulletinsTabProps): React.JSX.Element {
  const [detailBulletin, setDetailBulletin] = useState<Bulletin | null>(null);

  const { data: bulletins = [], isLoading: loadingBulletins } = useQuery({
    queryKey: ["bulletins-eleve", eleveId],
    queryFn: async () => {
      const { data } = await api.get<Bulletin[]>(PEDAGOGIE_API.bulletinsEleve(eleveId));
      return data;
    },
  });

  const { data: notes = [], isLoading: loadingNotes } = useQuery({
    queryKey: ["notes-eleve", eleveId],
    queryFn: async () => {
      const { data } = await api.get<Note[]>(PEDAGOGIE_API.notesHistorique(eleveId));
      return data;
    },
  });

  const { data: periodes = [] } = useQuery({
    queryKey: ["periodes"],
    queryFn: async () => {
      const { data } = await api.get<Periode[]>(ETABLISSEMENT_API.periodes);
      return data;
    },
  });

  const { data: sequences = [] } = useQuery({
    queryKey: ["sequences-evaluation"],
    queryFn: async () => {
      const { data } = await api.get<SequenceEvaluation[]>(
        ETABLISSEMENT_API.sequencesEvaluation,
      );
      return data;
    },
  });

  const { data: matieres = [] } = useQuery({
    queryKey: ["matieres"],
    queryFn: async () => {
      const { data } = await api.get<Matiere[]>(ETABLISSEMENT_API.matieres);
      return data;
    },
  });

  const periodeMap = useMemo(
    () => new Map(periodes.map((p) => [p.id, p.nom])),
    [periodes],
  );
  const sequenceMap = useMemo(
    () => new Map(sequences.map((s) => [s.id, s.nom])),
    [sequences],
  );
  const matiereMap = useMemo(
    () => new Map(matieres.map((m) => [m.id, m.nom])),
    [matieres],
  );

  const bulletinColumns: DataTableColumn<Bulletin>[] = [
    {
      key: "periode",
      header: "Période",
      render: (r) => periodeMap.get(r.periode_id) ?? "—",
    },
    {
      key: "moyenne",
      header: "Moyenne",
      render: (r) =>
        r.type_bulletin === "competences"
          ? "Compétences"
          : formatDecimal(r.moyenne_generale),
    },
    {
      key: "rang",
      header: "Rang",
      render: (r) =>
        r.rang != null ? `${r.rang}/${r.effectif_classe ?? "—"}` : "—",
    },
    {
      key: "mention",
      header: "Mention",
      render: (r) => <MentionBadge mention={r.mention} />,
    },
    {
      key: "statut",
      header: "Statut",
      render: (r) => <Badge variant="muted">{STATUT_LABELS[r.statut]}</Badge>,
    },
    {
      key: "actions",
      header: "Actions",
      render: (r) => (
        <Button size="sm" variant="outline" onClick={() => setDetailBulletin(r)}>
          <Eye className="mr-1 h-4 w-4" />
          Voir détail
        </Button>
      ),
    },
  ];

  const noteColumns: DataTableColumn<Note>[] = [
    {
      key: "periode",
      header: "Période / Séquence",
      render: (r) => {
        if (r.sequence_id) {
          return sequenceMap.get(r.sequence_id) ?? "Séquence";
        }
        if (r.periode_id) {
          return periodeMap.get(r.periode_id) ?? "—";
        }
        return "—";
      },
    },
    {
      key: "matiere",
      header: "Matière",
      render: (r) =>
        r.matiere_id ? (matiereMap.get(r.matiere_id) ?? "—") : "—",
    },
    {
      key: "note",
      header: "Note",
      render: (r) =>
        r.valeur != null
          ? String(r.valeur)
          : r.valeur_qualitative
            ? formatStatutCompetence(r.valeur_qualitative)
            : "—",
    },
    {
      key: "appreciation",
      header: "Appréciation",
      render: (r) => r.appreciation ?? "—",
    },
  ];

  if (loadingBulletins || loadingNotes) {
    return <LoadingSpinner />;
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Bulletins générés</CardTitle>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={bulletinColumns}
            data={bulletins}
            page={1}
            pageSize={bulletins.length || 1}
            total={bulletins.length}
            onPageChange={() => undefined}
            emptyMessage="Aucun bulletin généré"
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Notes par période et matière</CardTitle>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={noteColumns}
            data={notes}
            page={1}
            pageSize={notes.length || 1}
            total={notes.length}
            onPageChange={() => undefined}
            emptyMessage="Aucune note enregistrée"
          />
        </CardContent>
      </Card>

      <Dialog open={Boolean(detailBulletin)} onClose={() => setDetailBulletin(null)}>
        <h2 className="mb-2 text-lg font-semibold">
          Bulletin — {eleveNom}
        </h2>
        {detailBulletin ? (
          <div className="space-y-4 text-sm">
            <div className="flex flex-wrap gap-2 text-muted-foreground">
              <span>Période : {periodeMap.get(detailBulletin.periode_id) ?? "—"}</span>
              {detailBulletin.type_bulletin !== "competences" ? (
                <>
                  <span>Moyenne : {formatDecimal(detailBulletin.moyenne_generale)}</span>
                  <span>
                    Rang : {detailBulletin.rang ?? "—"}/
                    {detailBulletin.effectif_classe ?? "—"}
                  </span>
                </>
              ) : null}
              <Badge variant="muted">{STATUT_LABELS[detailBulletin.statut]}</Badge>
            </div>
            {detailBulletin.appreciation_generale ? (
              <p>
                <span className="font-medium">Appréciation générale :</span>{" "}
                {detailBulletin.appreciation_generale}
              </p>
            ) : null}
            {detailBulletin.lignes && detailBulletin.lignes.length > 0 ? (
              <ul className="divide-y rounded-lg border">
                {detailBulletin.lignes.map((ligne) => (
                  <li
                    key={ligne.id}
                    className="flex items-center justify-between gap-2 px-3 py-2"
                  >
                    <span>{matiereMap.get(ligne.matiere_id) ?? "Matière"}</span>
                    <span className="font-medium">
                      {ligne.note != null
                        ? ligne.note
                        : formatStatutCompetence(ligne.statut_competence)}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-muted-foreground">Aucune ligne de bulletin.</p>
            )}
          </div>
        ) : null}
        <div className="mt-4 flex justify-end">
          <Button variant="outline" onClick={() => setDetailBulletin(null)}>
            Fermer
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
