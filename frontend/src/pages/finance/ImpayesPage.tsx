import { useQueries, useQuery } from "@tanstack/react-query";
import { Download } from "lucide-react";
import { useMemo, useState } from "react";

import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { api, getErrorMessage } from "@/lib/api";
import { downloadFile } from "@/lib/download";
import { ETABLISSEMENT_API } from "@/lib/etablissement-api";
import { ELEVES_API } from "@/lib/eleves-api";
import { FINANCE_API, REPORTING_FINANCE_API } from "@/lib/finance-api";
import { getEleveClasseId, resolveClasseNom } from "@/lib/eleve-utils";
import { useToastStore } from "@/stores/toastStore";
import type { AnneeScolaire, Classe, DossierEleve, Impaye } from "@/types";

interface ImpayeRow extends Impaye {
  id: string;
  classe_nom: string;
}

export function ImpayesPage(): React.JSX.Element {
  const toast = useToastStore((s) => s.show);
  const [anneeId, setAnneeId] = useState("");
  const [exporting, setExporting] = useState(false);

  const { data: annees = [] } = useQuery({
    queryKey: ["annees-scolaires"],
    queryFn: async () => {
      const { data } = await api.get<AnneeScolaire[]>(ETABLISSEMENT_API.annees);
      return data;
    },
  });

  const { data: classes = [] } = useQuery({
    queryKey: ["classes"],
    queryFn: async () => {
      const { data } = await api.get<Classe[]>(ETABLISSEMENT_API.classes);
      return data;
    },
  });

  const { data: impayes = [], isLoading } = useQuery({
    queryKey: ["impayes", anneeId],
    queryFn: async () => {
      const { data } = await api.get<Impaye[]>(FINANCE_API.impayes, {
        params: { annee_id: anneeId },
      });
      return data;
    },
    enabled: Boolean(anneeId),
  });

  const sorted = useMemo(
    () => [...impayes].sort((a, b) => Number(b.montant_restant) - Number(a.montant_restant)),
    [impayes],
  );

  const dossierQueries = useQueries({
    queries: sorted.slice(0, 50).map((row) => ({
      queryKey: ["impaye-classe", row.eleve_id],
      queryFn: async () => {
        const { data } = await api.get<DossierEleve>(ELEVES_API.dossier(row.eleve_id));
        return data;
      },
      enabled: Boolean(anneeId),
      staleTime: 60_000,
    })),
  });

  const rows: ImpayeRow[] = sorted.map((row, index) => {
    const dossier = dossierQueries[index]?.data;
    const classeId = dossier ? getEleveClasseId(dossier) : undefined;
    return {
      ...row,
      id: row.eleve_id,
      classe_nom: resolveClasseNom(classeId, classes),
    };
  });

  const columns: DataTableColumn<ImpayeRow>[] = [
    {
      key: "eleve",
      header: "Élève",
      render: (r) => `${r.nom} ${r.prenom}`,
    },
    { key: "matricule", header: "Matricule", render: (r) => r.matricule },
    { key: "classe", header: "Classe", render: (r) => r.classe_nom },
    {
      key: "du",
      header: "Frais dus",
      render: (r) => `${Number(r.total_du).toLocaleString("fr-FR")} FCFA`,
    },
    {
      key: "paye",
      header: "Frais payés",
      render: (r) => `${Number(r.total_paye).toLocaleString("fr-FR")} FCFA`,
    },
    {
      key: "reste",
      header: "Reste à payer",
      render: (r) => (
        <span className="font-medium text-red-600">
          {Number(r.montant_restant).toLocaleString("fr-FR")} FCFA
        </span>
      ),
    },
  ];

  const handleExport = async (): Promise<void> => {
    if (!anneeId) return;
    setExporting(true);
    try {
      await downloadFile(
        REPORTING_FINANCE_API.exportRapportFinancier,
        "rapport-financier.xlsx",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        { annee_id: anneeId, format: "excel" },
      );
      toast("Export Excel téléchargé");
    } catch (err) {
      toast(getErrorMessage(err), "error");
    } finally {
      setExporting(false);
    }
  };

  const loadingClasses = dossierQueries.some((q) => q.isLoading);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Select
          value={anneeId}
          onChange={(e) => setAnneeId(e.target.value)}
          className="max-w-[240px]"
        >
          <option value="">Sélectionner une année</option>
          {annees.map((a) => (
            <option key={a.id} value={a.id}>
              {a.libelle}
            </option>
          ))}
        </Select>
        <Button
          variant="outline"
          disabled={!anneeId || exporting}
          onClick={() => void handleExport()}
        >
          <Download className="mr-2 h-4 w-4" />
          {exporting ? "Export…" : "Export Excel"}
        </Button>
      </div>

      {!anneeId ? (
        <p className="text-sm text-muted-foreground">
          Sélectionnez une année scolaire pour afficher les impayés.
        </p>
      ) : isLoading || loadingClasses ? (
        <LoadingSpinner />
      ) : (
        <DataTable
          columns={columns}
          data={rows}
          page={1}
          pageSize={rows.length || 1}
          total={rows.length}
          onPageChange={() => {}}
          emptyMessage="Aucun impayé pour cette année"
        />
      )}
    </div>
  );
}
