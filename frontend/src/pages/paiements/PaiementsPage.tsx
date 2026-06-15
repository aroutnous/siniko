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
import { PageHeader } from "@/components/ui/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useHasPermission } from "@/hooks/useHasPermission";
import { useMenuAccess } from "@/hooks/useMenuAccess";
import { useSallesSelectData } from "@/hooks/useSallesSelectData";
import { api, getErrorMessage } from "@/lib/api";
import { downloadPdf } from "@/lib/download";
import { ETABLISSEMENT_API } from "@/lib/etablissement-api";
import { getSalleDisplayName } from "@/lib/etablissement-utils";
import { ELEVES_API } from "@/lib/eleves-api";
import { FINANCE_API, REPORTING_FINANCE_API } from "@/lib/finance-api";
import { getEleveClasseId, resolveClasseNom } from "@/lib/eleve-utils";
import { useToastStore } from "@/stores/toastStore";
import type {
  AnneeScolaire,
  DossierEleve,
  Eleve,
  FraisScolaire,
  Impaye,
  Paiement,
  Salle,
  StatutPaiement,
} from "@/types";

const INITIAL: PaiementFormValues = {
  eleve_id: "",
  frais_id: "",
  montant_paye: "",
  mode_paiement: "especes",
};

interface ImpayeRow extends Impaye {
  id: string;
  classe_nom: string;
}

export function PaiementsPage(): React.JSX.Element {
  const queryClient = useQueryClient();
  const toast = useToastStore((s) => s.show);
  const { can } = useMenuAccess();
  const hasPermission = useHasPermission();

  const canEnregistrer = hasPermission("paiements.enregistrer");
  const canConsulter = hasPermission("paiements.consulter");
  const canValider = can.paiementsValider;
  const canRetards = hasPermission("paiements.suivre_retard");
  const canHistorique = hasPermission("paiements.historique");

  const tabs = useMemo(() => {
    const list: { id: string; label: string }[] = [];
    if (canEnregistrer) list.push({ id: "enregistrer", label: "Enregistrer" });
    if (canConsulter) list.push({ id: "suivi", label: "Suivi" });
    if (canRetards) list.push({ id: "retards", label: "Retards" });
    if (canHistorique) list.push({ id: "historique", label: "Historique" });
    return list;
  }, [canEnregistrer, canConsulter, canRetards, canHistorique]);

  const defaultTab = tabs[0]?.id ?? "suivi";

  const [form, setForm] = useState<PaiementFormValues>(INITIAL);
  const [actionId, setActionId] = useState<string | null>(null);
  const [anneeRetards, setAnneeRetards] = useState("");
  const [classeRetards, setClasseRetards] = useState("");
  const [dateDebut, setDateDebut] = useState("");
  const [dateFin, setDateFin] = useState("");

  const { data: eleves = [] } = useQuery({
    queryKey: ["eleves-paiements"],
    queryFn: async () => {
      const { data } = await api.get<Eleve[]>(ELEVES_API.list);
      return data;
    },
    enabled: canEnregistrer || canHistorique,
  });

  const { data: anneeActive } = useQuery({
    queryKey: ["annee-active"],
    queryFn: async () => {
      const { data } = await api.get<AnneeScolaire>(ETABLISSEMENT_API.anneeActive);
      return data;
    },
    enabled: canEnregistrer || canRetards,
  });

  const { data: annees = [] } = useQuery({
    queryKey: ["annees-scolaires"],
    queryFn: async () => {
      const { data } = await api.get<AnneeScolaire[]>(ETABLISSEMENT_API.annees);
      return data;
    },
    enabled: canRetards,
  });

  const { data: salles = [] } = useQuery({
    queryKey: ["salles"],
    queryFn: async () => {
      const { data } = await api.get<Salle[]>(ETABLISSEMENT_API.salles);
      return data;
    },
    enabled: canRetards,
  });

  const { sortedSalles, classesMap } = useSallesSelectData(salles);

  const niveauxMap = useMemo(
    () => new Map([...classesMap.entries()].map(([id, c]) => [id, c.nom])),
    [classesMap],
  );

  const { data: frais = [] } = useQuery({
    queryKey: ["frais", anneeActive?.id],
    queryFn: async () => {
      const { data } = await api.get<FraisScolaire[]>(FINANCE_API.frais, {
        params: { annee_id: anneeActive?.id },
      });
      return data;
    },
    enabled: Boolean(anneeActive?.id) && canEnregistrer,
  });

  const { data: todayPayments = [], isLoading: loadingSuivi } = useQuery({
    queryKey: ["paiements-jour"],
    queryFn: async () => {
      const { data } = await api.get<Paiement[]>(FINANCE_API.paiements);
      return data;
    },
    enabled: canConsulter,
  });

  const { data: impayes = [], isLoading: loadingImpayes } = useQuery({
    queryKey: ["impayes", anneeRetards],
    queryFn: async () => {
      const { data } = await api.get<Impaye[]>(FINANCE_API.impayes, {
        params: { annee_id: anneeRetards },
      });
      return data;
    },
    enabled: Boolean(anneeRetards) && canRetards,
  });

  const { data: fraisAll = [] } = useQuery({
    queryKey: ["frais-all"],
    queryFn: async () => {
      const { data } = await api.get<FraisScolaire[]>(FINANCE_API.frais);
      return data;
    },
    enabled: canHistorique,
  });

  const { data: transactions = [], isLoading: loadingHistorique } = useQuery({
    queryKey: ["finance-transactions", dateDebut, dateFin],
    queryFn: async () => {
      const params: Record<string, string> = {};
      if (dateDebut) params.date_debut = dateDebut;
      if (dateFin) params.date_fin = dateFin;
      const { data } = await api.get<Paiement[]>(FINANCE_API.transactions, { params });
      return data;
    },
    enabled: canHistorique,
  });

  const eleveMap = useMemo(
    () => new Map(eleves.map((e) => [e.id, `${e.nom} ${e.prenom}`])),
    [eleves],
  );
  const fraisMap = useMemo(
    () => new Map((canHistorique ? fraisAll : frais).map((f) => [f.id, f.libelle])),
    [frais, fraisAll, canHistorique],
  );

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

  const suiviColumns: DataTableColumn<Paiement>[] = [
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
          {r.statut === "en_attente" && canValider ? (
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
            Reçu
          </Button>
        </div>
      ),
    },
  ];

  const historiqueTotal = useMemo(
    () => transactions.reduce((sum, t) => sum + Number(t.montant_paye), 0),
    [transactions],
  );

  const historiqueColumns: DataTableColumn<Paiement>[] = [
    { key: "date", header: "Date", render: (r) => r.date_paiement },
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
    {
      key: "ref",
      header: "Référence",
      render: (r) => r.reference_transaction ?? "—",
    },
    { key: "statut", header: "Statut", render: (r) => statutBadge(r.statut) },
  ];

  if (tabs.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Vous n&apos;avez pas accès aux paiements.
      </p>
    );
  }

  return (
    <div>
      <PageHeader
        title="Paiements"
        description="Enregistrement, suivi et historique des paiements scolaires"
      />

      <Tabs defaultValue={defaultTab}>
        <TabsList>
          {tabs.map((t) => (
            <TabsTrigger key={t.id} value={t.id}>
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>

        {canEnregistrer ? (
          <TabsContent value="enregistrer">
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
                      setForm((p) => ({
                        ...p,
                        [field]: value as PaiementFormValues[typeof field],
                      }))
                    }
                    eleves={eleves}
                    frais={frais}
                  />
                  <Button
                    type="submit"
                    disabled={createMutation.isPending || !anneeActive}
                  >
                    {createMutation.isPending ? "Enregistrement…" : "Enregistrer"}
                  </Button>
                </form>
              </CardContent>
            </Card>
          </TabsContent>
        ) : null}

        {canConsulter ? (
          <TabsContent value="suivi">
            {loadingSuivi ? (
              <LoadingSpinner />
            ) : (
              <DataTable
                columns={suiviColumns}
                data={todayPayments}
                page={1}
                pageSize={10}
                total={todayPayments.length}
                onPageChange={() => undefined}
                emptyMessage="Aucun paiement enregistré aujourd'hui"
              />
            )}
          </TabsContent>
        ) : null}

        {canRetards ? (
          <TabsContent value="retards">
            <div className="mb-4 flex flex-wrap gap-4">
              <Select
                value={anneeRetards}
                onChange={(e) => setAnneeRetards(e.target.value)}
                className="max-w-xs"
              >
                <option value="">Année scolaire</option>
                {annees.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.libelle}
                  </option>
                ))}
              </Select>
              <Select
                value={classeRetards}
                onChange={(e) => setClasseRetards(e.target.value)}
                className="max-w-xs"
              >
                <option value="">Toutes les classes</option>
                {sortedSalles.map((s) => (
                  <option key={s.id} value={s.id}>
                    {getSalleDisplayName(s, classesMap.get(s.classe_id) ?? null)}
                  </option>
                ))}
              </Select>
            </div>
            <RetardsTable
              impayes={impayes}
              loading={loadingImpayes}
              anneeId={anneeRetards}
              classeFilter={classeRetards}
              salles={salles}
              niveauxMap={niveauxMap}
            />
          </TabsContent>
        ) : null}

        {canHistorique ? (
          <TabsContent value="historique">
            <div className="mb-4 flex flex-wrap gap-4">
              <div className="space-y-2">
                <Label htmlFor="date_debut">Date début</Label>
                <Input
                  id="date_debut"
                  type="date"
                  value={dateDebut}
                  onChange={(e) => setDateDebut(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="date_fin">Date fin</Label>
                <Input
                  id="date_fin"
                  type="date"
                  value={dateFin}
                  onChange={(e) => setDateFin(e.target.value)}
                />
              </div>
            </div>
            {loadingHistorique ? (
              <LoadingSpinner />
            ) : (
              <>
                <DataTable
                  columns={historiqueColumns}
                  data={transactions}
                  page={1}
                  pageSize={transactions.length || 1}
                  total={transactions.length}
                  onPageChange={() => undefined}
                  emptyMessage="Aucune transaction sur la période"
                />
                <p className="mt-4 text-right text-sm font-medium">
                  Total : {historiqueTotal.toLocaleString("fr-FR")} FCFA
                </p>
              </>
            )}
          </TabsContent>
        ) : null}
      </Tabs>
    </div>
  );
}

function RetardsTable({
  impayes,
  loading,
  anneeId,
  classeFilter,
  salles,
  niveauxMap,
}: {
  impayes: Impaye[];
  loading: boolean;
  anneeId: string;
  classeFilter: string;
  salles: Salle[];
  niveauxMap: Map<string, string>;
}): React.JSX.Element {
  const sorted = useMemo(
    () => [...impayes].sort((a, b) => Number(b.montant_restant) - Number(a.montant_restant)),
    [impayes],
  );

  const dossierQueries = useQuery({
    queryKey: ["retards-dossiers", sorted.map((r) => r.eleve_id).join(",")],
    queryFn: async () => {
      const results = await Promise.all(
        sorted.slice(0, 50).map(async (row) => {
          const { data } = await api.get<DossierEleve>(ELEVES_API.dossier(row.eleve_id));
          return { eleve_id: row.eleve_id, dossier: data };
        }),
      );
      return new Map(results.map((r) => [r.eleve_id, r.dossier]));
    },
    enabled: Boolean(anneeId) && sorted.length > 0,
  });

  const rows: ImpayeRow[] = useMemo(() => {
    const dossierMap = dossierQueries.data ?? new Map<string, DossierEleve>();
    return sorted
      .map((row) => {
        const dossier = dossierMap.get(row.eleve_id);
        const eleveClasseId = dossier ? getEleveClasseId(dossier) : undefined;
        return {
          ...row,
          id: row.eleve_id,
          classe_nom: resolveClasseNom(eleveClasseId, salles, niveauxMap),
          eleveClasseId,
        };
      })
      .filter((row) => !classeFilter || row.eleveClasseId === classeFilter)
      .map(({ eleveClasseId: _c, ...rest }) => rest);
  }, [sorted, dossierQueries.data, salles, niveauxMap, classeFilter]);

  const columns: DataTableColumn<ImpayeRow>[] = [
    {
      key: "eleve",
      header: "Élève",
      render: (r) => `${r.nom} ${r.prenom} (${r.matricule})`,
    },
    { key: "classe", header: "Classe", render: (r) => r.classe_nom },
    {
      key: "du",
      header: "Montant dû",
      render: (r) => `${Number(r.total_du).toLocaleString("fr-FR")} FCFA`,
    },
    {
      key: "paye",
      header: "Payé",
      render: (r) => `${Number(r.total_paye).toLocaleString("fr-FR")} FCFA`,
    },
    {
      key: "reste",
      header: "Reste",
      render: (r) => (
        <span className="font-medium text-destructive">
          {Number(r.montant_restant).toLocaleString("fr-FR")} FCFA
        </span>
      ),
    },
  ];

  if (!anneeId) {
    return (
      <p className="text-sm text-muted-foreground">
        Sélectionnez une année scolaire pour afficher les retards.
      </p>
    );
  }

  if (loading || dossierQueries.isLoading) return <LoadingSpinner />;

  return (
    <DataTable
      columns={columns}
      data={rows}
      page={1}
      pageSize={rows.length || 10}
      total={rows.length}
      onPageChange={() => undefined}
      emptyMessage="Aucun paiement en retard"
    />
  );
}
