import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download } from "lucide-react";
import { useMemo, useState } from "react";

import {
  PaiementForm,
  type PaiementFormValues,
} from "@/components/finance/PaiementForm";
import { ModePaiementBadge } from "@/components/finance/ModePaiementBadge";
import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useFinanceAccess } from "@/hooks/useFinanceAccess";
import { api, getErrorMessage } from "@/lib/api";
import { downloadPdf } from "@/lib/download";
import { ETABLISSEMENT_API } from "@/lib/etablissement-api";
import { ELEVES_API } from "@/lib/eleves-api";
import { FINANCE_API, REPORTING_FINANCE_API } from "@/lib/finance-api";
import { useToastStore } from "@/stores/toastStore";
import type { AnneeScolaire, Eleve, FraisScolaire, Paiement, StatutPaiement } from "@/types";

const INITIAL: PaiementFormValues = {
  eleve_id: "",
  frais_id: "",
  montant_paye: "",
  mode_paiement: "especes",
};

export function PaiementsPage(): React.JSX.Element {
  const queryClient = useQueryClient();
  const toast = useToastStore((s) => s.show);
  const { canRegisterPaiements, canValidatePaiements } = useFinanceAccess();
  const [form, setForm] = useState<PaiementFormValues>(INITIAL);
  const [actionId, setActionId] = useState<string | null>(null);

  const { data: eleves = [], isLoading: loadingEleves } = useQuery({
    queryKey: ["eleves-paiements"],
    queryFn: async () => {
      const { data } = await api.get<Eleve[]>(ELEVES_API.list);
      return data;
    },
  });

  const { data: anneeActive, isLoading: loadingAnnee } = useQuery({
    queryKey: ["annee-active"],
    queryFn: async () => {
      const { data } = await api.get<AnneeScolaire>(ETABLISSEMENT_API.anneeActive);
      return data;
    },
  });

  const { data: frais = [], isLoading: loadingFrais } = useQuery({
    queryKey: ["frais", anneeActive?.id],
    queryFn: async () => {
      const { data } = await api.get<FraisScolaire[]>(FINANCE_API.frais, {
        params: { annee_id: anneeActive?.id },
      });
      return data;
    },
    enabled: Boolean(anneeActive?.id),
  });

  const { data: todayPayments = [], isLoading: loadingPaiements } = useQuery({
    queryKey: ["paiements-jour"],
    queryFn: async () => {
      const { data } = await api.get<Paiement[]>(FINANCE_API.paiements);
      return data;
    },
  });

  const eleveMap = useMemo(
    () => new Map(eleves.map((e) => [e.id, `${e.nom} ${e.prenom}`])),
    [eleves],
  );
  const fraisMap = useMemo(() => new Map(frais.map((f) => [f.id, f.libelle])), [frais]);

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!anneeActive) throw new Error("Aucune année scolaire active");
      const { data } = await api.post<Paiement>(FINANCE_API.paiements, {
        eleve_id: form.eleve_id,
        frais_id: form.frais_id,
        annee_scolaire_id: anneeActive.id,
        montant_paye: form.montant_paye,
        mode_paiement: form.mode_paiement,
      });
      return data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["paiements-jour"] });
      void queryClient.invalidateQueries({ queryKey: ["finance-transactions"] });
      toast("Paiement enregistré");
      setForm(INITIAL);
    },
    onError: (err) => toast(getErrorMessage(err), "error"),
  });

  const validateMutation = useMutation({
    mutationFn: async (id: string) => {
      const { data } = await api.put<Paiement>(FINANCE_API.paiementValider(id));
      return data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["paiements-jour"] });
      toast("Paiement validé");
      setActionId(null);
    },
    onError: (err) => {
      toast(getErrorMessage(err), "error");
      setActionId(null);
    },
  });

  const handleReceipt = async (paiement: Paiement): Promise<void> => {
    setActionId(paiement.id);
    try {
      await downloadPdf(
        REPORTING_FINANCE_API.impressionRecu(paiement.id),
        `recu-${paiement.reference_transaction ?? paiement.id}.pdf`,
      );
      toast("Reçu téléchargé");
    } catch (err) {
      toast(getErrorMessage(err), "error");
    } finally {
      setActionId(null);
    }
  };

  const statutBadge = (statut: StatutPaiement | string): React.JSX.Element => {
    const map: Record<string, "warning" | "success" | "destructive"> = {
      en_attente: "warning",
      valide: "success",
      annule: "destructive",
    };
    const labels: Record<string, string> = {
      en_attente: "En attente",
      valide: "Validé",
      annule: "Annulé",
    };
    return <Badge variant={map[statut] ?? "muted"}>{labels[statut] ?? statut}</Badge>;
  };

  const columns: DataTableColumn<Paiement>[] = [
    {
      key: "eleve",
      header: "Élève",
      render: (r) => eleveMap.get(r.eleve_id) ?? r.eleve_id.slice(0, 8),
    },
    {
      key: "frais",
      header: "Frais",
      render: (r) => fraisMap.get(r.frais_id) ?? "—",
    },
    {
      key: "montant",
      header: "Montant",
      render: (r) => `${Number(r.montant_paye).toLocaleString("fr-FR")} FCFA`,
    },
    {
      key: "mode",
      header: "Mode",
      render: (r) => <ModePaiementBadge mode={r.mode_paiement} />,
    },
    { key: "statut", header: "Statut", render: (r) => statutBadge(r.statut) },
    {
      key: "actions",
      header: "Actions",
      render: (r) => (
        <div className="flex gap-1">
          {r.statut === "en_attente" && canValidatePaiements ? (
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
          <Button
            size="sm"
            variant="ghost"
            disabled={actionId === r.id}
            onClick={() => void handleReceipt(r)}
          >
            <Download className="mr-2 h-4 w-4" />
            Reçu PDF
          </Button>
        </div>
      ),
    },
  ];

  if (loadingEleves || loadingAnnee || loadingFrais || loadingPaiements) {
    return <LoadingSpinner />;
  }

  return (
    <div className="space-y-6">
      {canRegisterPaiements ? (
        <Card>
          <CardHeader>
            <CardTitle>Nouveau paiement</CardTitle>
          </CardHeader>
          <CardContent>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                createMutation.mutate();
              }}
              className="space-y-4"
            >
              <PaiementForm
                values={form}
                onChange={(field, value) =>
                  setForm((p) => ({ ...p, [field]: value as PaiementFormValues[typeof field] }))
                }
                eleves={eleves}
                frais={frais}
              />
              <Button type="submit" disabled={createMutation.isPending || !anneeActive}>
                {createMutation.isPending ? "Enregistrement…" : "Enregistrer le paiement"}
              </Button>
            </form>
          </CardContent>
        </Card>
      ) : null}

      <div>
        <h2 className="mb-3 text-lg font-semibold">Paiements du jour</h2>
        <DataTable
          columns={columns}
          data={todayPayments}
          page={1}
          pageSize={10}
          total={todayPayments.length}
          onPageChange={() => undefined}
          emptyMessage="Aucun paiement enregistré aujourd'hui"
        />
      </div>
    </div>
  );
}
