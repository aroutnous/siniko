import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileText } from "lucide-react";
import { useMemo, useState } from "react";

import { BulletinCard } from "@/components/pedagogie/BulletinCard";
import { MentionBadge } from "@/components/pedagogie/MentionBadge";
import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { PageHeader } from "@/components/ui/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { usePedagogieAccess } from "@/hooks/usePedagogieAccess";
import { useSallesSelectData } from "@/hooks/useSallesSelectData";
import { api, getErrorMessage } from "@/lib/api";
import { downloadPdf } from "@/lib/download";
import { ETABLISSEMENT_API } from "@/lib/etablissement-api";
import { getSalleDisplayName } from "@/lib/etablissement-utils";
import { ELEVES_API } from "@/lib/eleves-api";
import { PEDAGOGIE_API, REPORTING_API } from "@/lib/pedagogie-api";
import { StatutCompetenceBadge } from "@/components/pedagogie/StatutCompetenceBadge";
import { useToastStore } from "@/stores/toastStore";
import { formatDecimal } from "@/lib/pedagogie-utils";
import type { Bulletin, Eleve, Matiere, Periode, Salle, StatutBulletin } from "@/types";

const STATUT_LABELS: Record<StatutBulletin, string> = {
  brouillon: "Brouillon",
  valide: "Validé",
  publie: "Publié",
};

interface BulletinRow extends Bulletin {
  eleve_nom: string;
}

export function BulletinsPage(): React.JSX.Element {
  const queryClient = useQueryClient();
  const toast = useToastStore((s) => s.show);
  const {
    canGenerateBulletins,
    canLoadBulletins,
    canValidateBulletins,
    canPublishBulletins,
  } = usePedagogieAccess();
  const [classeId, setClasseId] = useState("");
  const [periodeId, setPeriodeId] = useState("");
  const [actionId, setActionId] = useState<string | null>(null);

  const { data: salles = [] } = useQuery({
    queryKey: ["salles"],
    queryFn: async () => {
      const { data } = await api.get<Salle[]>(ETABLISSEMENT_API.salles);
      return data;
    },
  });

  const { sortedSalles, classesMap } = useSallesSelectData(salles);

  const { data: matieres = [] } = useQuery({
    queryKey: ["matieres"],
    queryFn: async () => {
      const { data } = await api.get<Matiere[]>(ETABLISSEMENT_API.matieres);
      return data;
    },
  });

  const matieresMap = useMemo(
    () => new Map(matieres.map((m) => [m.id, m.nom])),
    [matieres],
  );

  const { data: periodes = [] } = useQuery({
    queryKey: ["periodes"],
    queryFn: async () => {
      const { data } = await api.get<Periode[]>(ETABLISSEMENT_API.periodes);
      return data;
    },
  });

  const { data: eleves = [] } = useQuery({
    queryKey: ["eleves", "", classeId, ""],
    queryFn: async () => {
      const { data } = await api.get<Eleve[]>(ELEVES_API.list, {
        params: { classe_id: classeId },
      });
      return data;
    },
    enabled: Boolean(classeId),
  });

  const eleveMap = useMemo(
    () => new Map(eleves.map((e) => [e.id, `${e.nom} ${e.prenom}`])),
    [eleves],
  );

  const { data: bulletins = [], isLoading } = useQuery({
    queryKey: ["bulletins", classeId, periodeId],
    queryFn: async () => {
      const { data } = await api.post<Bulletin[]>(PEDAGOGIE_API.bulletinsGenerer, {
        classe_id: classeId,
        periode_id: periodeId,
      });
      return data;
    },
    enabled: false,
  });

  const generateMutation = useMutation({
    mutationFn: async () => {
      const { data } = await api.post<Bulletin[]>(PEDAGOGIE_API.bulletinsGenerer, {
        classe_id: classeId,
        periode_id: periodeId,
      });
      return data;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(["bulletins", classeId, periodeId], data);
      toast(`${data.length} bulletin(s) généré(s)`);
    },
    onError: (err) => toast(getErrorMessage(err), "error"),
  });

  const validateMutation = useMutation({
    mutationFn: async (id: string) => {
      const { data } = await api.put<Bulletin>(PEDAGOGIE_API.bulletinValider(id));
      return data;
    },
    onSuccess: (updated) => {
      queryClient.setQueryData<Bulletin[]>(
        ["bulletins", classeId, periodeId],
        (prev) => prev?.map((b) => (b.id === updated.id ? updated : b)) ?? [],
      );
      toast("Bulletin validé");
      setActionId(null);
    },
    onError: (err) => {
      toast(getErrorMessage(err), "error");
      setActionId(null);
    },
  });

  const publishMutation = useMutation({
    mutationFn: async (id: string) => {
      const { data } = await api.put<Bulletin>(PEDAGOGIE_API.bulletinPublier(id));
      return data;
    },
    onSuccess: (updated) => {
      queryClient.setQueryData<Bulletin[]>(
        ["bulletins", classeId, periodeId],
        (prev) => prev?.map((b) => (b.id === updated.id ? updated : b)) ?? [],
      );
      toast("Bulletin publié");
      setActionId(null);
    },
    onError: (err) => {
      toast(getErrorMessage(err), "error");
      setActionId(null);
    },
  });

  const handleDownload = async (bulletin: Bulletin): Promise<void> => {
    setActionId(bulletin.id);
    try {
      await downloadPdf(
        REPORTING_API.impressionBulletin(bulletin.id),
        `bulletin-${eleveMap.get(bulletin.eleve_id) ?? bulletin.id}.pdf`,
      );
      toast("Bulletin téléchargé");
    } catch (err) {
      toast(getErrorMessage(err), "error");
    } finally {
      setActionId(null);
    }
  };

  const rows: BulletinRow[] = bulletins.map((b) => ({
    ...b,
    eleve_nom: eleveMap.get(b.eleve_id) ?? b.eleve_id,
  }));

  const isCompetences =
    bulletins.length > 0 && bulletins[0]?.type_bulletin === "competences";

  const columns: DataTableColumn<BulletinRow>[] = [
    { key: "eleve", header: "Élève", render: (r) => r.eleve_nom },
    ...(isCompetences
      ? [
          {
            key: "competences",
            header: "Compétences",
            render: (r: BulletinRow) => {
              const lignes = r.lignes ?? [];
              if (lignes.length === 0) return "—";
              return (
                <div className="flex flex-wrap gap-1">
                  {lignes.map((l) => (
                    <span key={l.id} className="inline-flex items-center gap-1">
                      <span className="text-muted-foreground">
                        {matieresMap.get(l.matiere_id) ?? "Domaine"} :
                      </span>
                      <StatutCompetenceBadge statut={l.statut_competence} />
                    </span>
                  ))}
                </div>
              );
            },
          },
        ]
      : [
          {
            key: "moyenne",
            header: "Moyenne",
            render: (r: BulletinRow) => formatDecimal(r.moyenne_generale),
          },
          {
            key: "rang",
            header: "Rang",
            render: (r: BulletinRow) => r.rang ?? "—",
          },
          {
            key: "mention",
            header: "Mention",
            render: (r: BulletinRow) => <MentionBadge mention={r.mention} />,
          },
        ]),
    {
      key: "statut",
      header: "Statut",
      render: (r) => (
        <Badge
          variant={
            r.statut === "publie"
              ? "success"
              : r.statut === "valide"
                ? "warning"
                : "muted"
          }
        >
          {STATUT_LABELS[r.statut]}
        </Badge>
      ),
    },
    {
      key: "actions",
      header: "Actions",
      render: (r) => (
        <div className="flex gap-1">
          {r.statut === "brouillon" && canValidateBulletins ? (
            <Button
              size="sm"
              variant="outline"
              disabled={actionId === r.id}
              onClick={() => {
                setActionId(r.id);
                validateMutation.mutate(r.id);
              }}
            >
              Valider
            </Button>
          ) : null}
          {r.statut === "valide" && canPublishBulletins ? (
            <Button
              size="sm"
              variant="outline"
              disabled={actionId === r.id}
              onClick={() => {
                setActionId(r.id);
                publishMutation.mutate(r.id);
              }}
            >
              Publier
            </Button>
          ) : null}
          {r.statut === "publie" ? (
            <Button
              size="sm"
              variant="ghost"
              disabled={actionId === r.id}
              onClick={() => void handleDownload(r)}
            >
              Télécharger PDF
            </Button>
          ) : null}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Bulletins"
        description="Génération, validation et publication"
        breadcrumb="Pédagogie"
        action={
          canGenerateBulletins || canLoadBulletins ? (
            <Button
              disabled={!classeId || !periodeId || generateMutation.isPending}
              onClick={() => generateMutation.mutate()}
            >
              <FileText className="mr-2 h-4 w-4" />
              {generateMutation.isPending
                ? "Chargement…"
                : canGenerateBulletins
                  ? "Générer bulletins"
                  : "Charger bulletins"}
            </Button>
          ) : undefined
        }
      />

      <div className="flex flex-wrap gap-2">
        <Select
          value={classeId}
          onChange={(e) => {
            setClasseId(e.target.value);
            queryClient.removeQueries({ queryKey: ["bulletins"] });
          }}
          className="max-w-[220px]"
        >
          <option value="">Sélectionner une classe</option>
          {sortedSalles.map((s) => (
            <option key={s.id} value={s.id}>
              {getSalleDisplayName(s, classesMap.get(s.classe_id) ?? null)}
            </option>
          ))}
        </Select>
        <Select
          value={periodeId}
          onChange={(e) => {
            setPeriodeId(e.target.value);
            queryClient.removeQueries({ queryKey: ["bulletins"] });
          }}
          className="max-w-[220px]"
          disabled={!classeId}
        >
          <option value="">Sélectionner une période</option>
          {periodes.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nom}
            </option>
          ))}
        </Select>
      </div>

      {generateMutation.isPending || isLoading ? (
        <LoadingSpinner />
      ) : bulletins.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {classeId && periodeId
            ? "Cliquez sur « Générer bulletins » pour afficher les bulletins."
            : "Sélectionnez une classe et une période."}
        </p>
      ) : (
        <>
          <DataTable
            columns={columns}
            data={rows}
            page={1}
            pageSize={rows.length || 1}
            total={rows.length}
            onPageChange={() => {}}
          />
          <div className="grid gap-3 md:grid-cols-2">
            {rows.map((row) => (
              <BulletinCard
                key={row.id}
                eleveNom={row.eleve_nom}
                bulletin={row}
                matieresMap={matieresMap}
                canValidate={canValidateBulletins}
                canPublish={canPublishBulletins}
                loading={actionId === row.id}
                onValidate={() => {
                  setActionId(row.id);
                  validateMutation.mutate(row.id);
                }}
                onPublish={() => {
                  setActionId(row.id);
                  publishMutation.mutate(row.id);
                }}
                onDownload={() => void handleDownload(row)}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
