import { useQuery } from "@tanstack/react-query";
import { Download } from "lucide-react";
import { useMemo, useState } from "react";

import { MentionBadge } from "@/components/pedagogie/MentionBadge";
import { ResultatsChart } from "@/components/pedagogie/ResultatsChart";
import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { api, getErrorMessage } from "@/lib/api";
import { downloadFile } from "@/lib/download";
import { ETABLISSEMENT_API } from "@/lib/etablissement-api";
import { getSalleDisplayName } from "@/lib/etablissement-utils";
import { ELEVES_API } from "@/lib/eleves-api";
import { PEDAGOGIE_API, REPORTING_API } from "@/lib/pedagogie-api";
import { formatDecimal } from "@/lib/pedagogie-utils";
import { useSallesSelectData } from "@/hooks/useSallesSelectData";
import { useToastStore } from "@/stores/toastStore";
import type {
  ClassementEleve,
  Eleve,
  Matiere,
  Periode,
  ResultatsClasse,
  Salle,
} from "@/types";

interface ClassementRow extends ClassementEleve {
  id: string;
  eleve_nom: string;
}

export function ResultatsClassePage(): React.JSX.Element {
  const toast = useToastStore((s) => s.show);
  const [classeId, setClasseId] = useState("");
  const [periodeId, setPeriodeId] = useState("");
  const [exporting, setExporting] = useState(false);

  const { data: salles = [] } = useQuery({
    queryKey: ["salles"],
    queryFn: async () => {
      const { data } = await api.get<Salle[]>(ETABLISSEMENT_API.salles);
      return data;
    },
  });

  const { sortedSalles, classesMap } = useSallesSelectData(salles);

  const { data: periodes = [] } = useQuery({
    queryKey: ["periodes"],
    queryFn: async () => {
      const { data } = await api.get<Periode[]>(ETABLISSEMENT_API.periodes);
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

  const { data: resultats, isLoading } = useQuery({
    queryKey: ["resultats-classe", classeId, periodeId],
    queryFn: async () => {
      const { data } = await api.get<ResultatsClasse>(
        PEDAGOGIE_API.resultatsClasse(classeId),
        { params: { periode_id: periodeId } },
      );
      return data;
    },
    enabled: Boolean(classeId && periodeId),
  });

  const eleveMap = useMemo(
    () => new Map(eleves.map((e) => [e.id, `${e.nom} ${e.prenom}`])),
    [eleves],
  );

  const matiereMap = useMemo(
    () => new Map(matieres.map((m) => [m.id, m.nom])),
    [matieres],
  );

  const moyenneClasse = useMemo(() => {
    if (!resultats?.classement.length) return null;
    const vals = resultats.classement
      .map((c) => c.moyenne_generale)
      .filter((v): v is number => v !== null);
    if (vals.length === 0) return null;
    return vals.reduce((a, b) => a + b, 0) / vals.length;
  }, [resultats]);

  const chartData = useMemo(
    () =>
      (resultats?.moyennes_par_matiere ?? []).map((m) => ({
        matiere: matiereMap.get(m.matiere_id) ?? m.matiere_id,
        moyenne: Number(m.moyenne),
      })),
    [resultats, matiereMap],
  );

  const rows: ClassementRow[] = (resultats?.classement ?? []).map(
    (c): ClassementRow => ({
      ...c,
      id: c.eleve_id,
      eleve_nom: eleveMap.get(c.eleve_id) ?? c.eleve_id,
    }),
  );

  const columns: DataTableColumn<ClassementRow>[] = [
    { key: "eleve", header: "Élève", render: (r) => r.eleve_nom },
    {
      key: "moyenne",
      header: "Moyenne",
      render: (r) => formatDecimal(r.moyenne_generale),
    },
    { key: "rang", header: "Rang", render: (r) => r.rang ?? "—" },
    {
      key: "mention",
      header: "Mention",
      render: (r) => <MentionBadge mention={r.mention} />,
    },
  ];

  const handleExport = async (): Promise<void> => {
    if (!classeId || !periodeId) return;
    setExporting(true);
    try {
      const salle = salles.find((s) => s.id === classeId);
      const classeNom = salle
        ? getSalleDisplayName(salle, classesMap.get(salle.classe_id) ?? null)
        : "classe";
      await downloadFile(
        REPORTING_API.exportResultatsClasse,
        `resultats-${classeNom}.xlsx`,
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        { classe_id: classeId, periode_id: periodeId, format: "excel" },
      );
      toast("Export Excel téléchargé");
    } catch (err) {
      toast(getErrorMessage(err), "error");
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Résultats de classe"
        description="Statistiques et classement par période"
        breadcrumb="Pédagogie"
        action={
          <Button
            variant="outline"
            disabled={!classeId || !periodeId || exporting}
            onClick={() => void handleExport()}
          >
            <Download className="mr-2 h-4 w-4" />
            {exporting ? "Export…" : "Export Excel"}
          </Button>
        }
      />

      <div className="flex flex-wrap gap-2">
        <Select
          value={classeId}
          onChange={(e) => setClasseId(e.target.value)}
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
          onChange={(e) => setPeriodeId(e.target.value)}
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

      {!classeId || !periodeId ? (
        <p className="text-sm text-muted-foreground">
          Sélectionnez une classe et une période.
        </p>
      ) : isLoading ? (
        <LoadingSpinner />
      ) : resultats ? (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">Moyenne classe</p>
                <p className="text-2xl font-bold">
                  {moyenneClasse !== null ? moyenneClasse.toFixed(2) : "—"}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">Taux de réussite</p>
                <p className="text-2xl font-bold">
                  {Number(resultats.taux_reussite).toFixed(1)} %
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">Nombre d&apos;élèves</p>
                <p className="text-2xl font-bold">{resultats.effectif}</p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardContent className="p-4">
              <h3 className="mb-4 font-semibold">Moyennes par matière</h3>
              <ResultatsChart data={chartData} />
            </CardContent>
          </Card>

          <DataTable
            columns={columns}
            data={rows}
            page={1}
            pageSize={rows.length || 1}
            total={rows.length}
            onPageChange={() => {}}
            emptyMessage="Aucun résultat — générez les bulletins d'abord"
          />
        </>
      ) : null}
    </div>
  );
}
