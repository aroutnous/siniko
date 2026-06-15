import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { useMemo, useState } from "react";

import {
  AbsenceForm,
  type AbsenceFormValues,
} from "@/components/eleves/AbsenceForm";
import { FormModal } from "@/components/etablissement/FormModal";
import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { PageHeader } from "@/components/ui/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { useElevesAccess } from "@/hooks/useElevesAccess";
import { useSallesSelectData } from "@/hooks/useSallesSelectData";
import { api, getErrorMessage } from "@/lib/api";
import { ETABLISSEMENT_API } from "@/lib/etablissement-api";
import { getSalleDisplayName } from "@/lib/etablissement-utils";
import { ELEVES_API } from "@/lib/eleves-api";
import { useToastStore } from "@/stores/toastStore";
import type {
  Absence,
  AbsenceCreatePayload,
  ClasseAbsencesResponse,
  Eleve,
  Periode,
  Salle,
  TypeAbsence,
} from "@/types";

interface AbsenceRow extends Absence {
  eleve_nom: string;
}

const INITIAL_FORM: AbsenceFormValues = {
  eleve_id: "",
  classe_id: "",
  date_absence: "",
  type: "",
  motif: "",
};

export function AbsencesPage(): React.JSX.Element {
  const queryClient = useQueryClient();
  const toast = useToastStore((s) => s.show);
  const { canManageAbsences } = useElevesAccess();
  const [classeId, setClasseId] = useState("");
  const [periodeId, setPeriodeId] = useState("");
  const [typeFilter, setTypeFilter] = useState<"" | TypeAbsence>("");
  const [open, setOpen] = useState(false);
  const [justifyOpen, setJustifyOpen] = useState(false);
  const [form, setForm] = useState<AbsenceFormValues>(INITIAL_FORM);
  const [justifyMotif, setJustifyMotif] = useState("");
  const [selectedAbsence, setSelectedAbsence] = useState<Absence | null>(null);

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

  const { data: eleves = [] } = useQuery({
    queryKey: ["eleves", "", classeId, ""],
    queryFn: async () => {
      const params: Record<string, string> = {};
      if (classeId) params.classe_id = classeId;
      const { data } = await api.get<Eleve[]>(ELEVES_API.list, { params });
      return data;
    },
    enabled: Boolean(classeId),
  });

  const { data: absencesData, isLoading } = useQuery({
    queryKey: ["absences-classe", classeId, periodeId],
    queryFn: async () => {
      const params: Record<string, string> = {};
      if (periodeId) params.periode_id = periodeId;
      const { data } = await api.get<ClasseAbsencesResponse>(
        ELEVES_API.absencesClasse(classeId),
        { params },
      );
      return data;
    },
    enabled: Boolean(classeId),
  });

  const eleveMap = useMemo(
    () => new Map(eleves.map((e) => [e.id, `${e.nom} ${e.prenom}`])),
    [eleves],
  );

  const rows = useMemo((): AbsenceRow[] => {
    if (!absencesData) return [];
    let list = absencesData.absences.map((a) => ({
      ...a,
      eleve_nom: eleveMap.get(a.eleve_id) ?? a.eleve_id,
    }));
    if (typeFilter) {
      list = list.filter((a) => a.type === typeFilter);
    }
    return list;
  }, [absencesData, eleveMap, typeFilter]);

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!form.eleve_id || !form.classe_id || !form.date_absence || !form.type) {
        throw new Error("Veuillez remplir tous les champs obligatoires");
      }
      const payload: AbsenceCreatePayload = {
        classe_id: form.classe_id,
        date_absence: form.date_absence,
        type: form.type,
        motif: form.motif || undefined,
      };
      const { data } = await api.post<Absence>(
        ELEVES_API.absences(form.eleve_id),
        payload,
      );
      return data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["absences-classe"] });
      void queryClient.invalidateQueries({ queryKey: ["eleve-dossier"] });
      toast("Absence enregistrée");
      setOpen(false);
      setForm({ ...INITIAL_FORM, classe_id: classeId });
    },
    onError: (err) => toast(getErrorMessage(err), "error"),
  });

  const justifyMutation = useMutation({
    mutationFn: async ({ id, motif }: { id: string; motif: string }) => {
      const { data } = await api.put<Absence>(ELEVES_API.justifierAbsence(id), {
        motif,
      });
      return data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["absences-classe"] });
      void queryClient.invalidateQueries({ queryKey: ["eleve-dossier"] });
      toast("Absence justifiée");
      setJustifyOpen(false);
      setJustifyMotif("");
      setSelectedAbsence(null);
    },
    onError: (err) => toast(getErrorMessage(err), "error"),
  });

  const updateForm = (field: keyof AbsenceFormValues, value: string): void => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const columns: DataTableColumn<AbsenceRow>[] = [
    { key: "eleve", header: "Élève", render: (r) => r.eleve_nom },
    { key: "date", header: "Date", render: (r) => r.date_absence },
    {
      key: "type",
      header: "Type",
      render: (r) => (
        <Badge variant={r.type === "absence" ? "warning" : "default"}>
          {r.type === "absence" ? "Absence" : "Retard"}
        </Badge>
      ),
    },
    {
      key: "justifiee",
      header: "Justifiée",
      render: (r) => (
        <Badge variant={r.justifiee ? "success" : "destructive"}>
          {r.justifiee ? "Oui" : "Non"}
        </Badge>
      ),
    },
    { key: "motif", header: "Motif", render: (r) => r.motif ?? "—" },
    {
      key: "actions",
      header: "Actions",
      render: (r) =>
        !r.justifiee && canManageAbsences ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setSelectedAbsence(r);
              setJustifyOpen(true);
            }}
          >
            Justifier
          </Button>
        ) : null,
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Absences et retards"
        description="Vue globale par classe"
        breadcrumb="Élèves"
        action={
          canManageAbsences ? (
            <Button
              disabled={!classeId}
              onClick={() => {
                setForm({ ...INITIAL_FORM, classe_id: classeId });
                setOpen(true);
              }}
            >
              <Plus className="mr-2 h-4 w-4" />
              Enregistrer absence
            </Button>
          ) : undefined
        }
      />

      <div className="flex flex-wrap gap-2">
        <Select
          value={classeId}
          onChange={(e) => setClasseId(e.target.value)}
          className="max-w-[200px]"
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
          className="max-w-[200px]"
          disabled={!classeId}
        >
          <option value="">Toutes les périodes</option>
          {periodes.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nom}
            </option>
          ))}
        </Select>
        <Select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value as "" | TypeAbsence)}
          className="max-w-[160px]"
          disabled={!classeId}
        >
          <option value="">Tous les types</option>
          <option value="absence">Absence</option>
          <option value="retard">Retard</option>
        </Select>
      </div>

      {absencesData ? (
        <div className="grid gap-3 sm:grid-cols-4">
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">Total</p>
              <p className="text-2xl font-bold">{absencesData.statistiques.total}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">Absences</p>
              <p className="text-2xl font-bold">{absencesData.statistiques.absences}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">Retards</p>
              <p className="text-2xl font-bold">{absencesData.statistiques.retards}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">Non justifiées</p>
              <p className="text-2xl font-bold">
                {absencesData.statistiques.non_justifiees}
              </p>
            </CardContent>
          </Card>
        </div>
      ) : null}

      {!classeId ? (
        <p className="text-sm text-muted-foreground">
          Sélectionnez une classe pour afficher les absences.
        </p>
      ) : isLoading ? (
        <LoadingSpinner />
      ) : (
        <DataTable
          columns={columns}
          data={rows}
          page={1}
          pageSize={rows.length || 1}
          total={rows.length}
          onPageChange={() => {}}
          emptyMessage="Aucune absence pour cette classe"
        />
      )}

      <FormModal
        open={open}
        title="Enregistrer une absence"
        onClose={() => {
          setOpen(false);
          setForm({ ...INITIAL_FORM, classe_id: classeId });
        }}
        onSubmit={() => createMutation.mutate()}
        loading={createMutation.isPending}
        submitLabel="Enregistrer"
      >
        <AbsenceForm
          values={form}
          onChange={updateForm}
          eleves={eleves}
          salles={sortedSalles}
          classesMap={classesMap}
        />
      </FormModal>

      <FormModal
        open={justifyOpen}
        title="Justifier l'absence"
        onClose={() => {
          setJustifyOpen(false);
          setJustifyMotif("");
          setSelectedAbsence(null);
        }}
        onSubmit={() => {
          if (!selectedAbsence || !justifyMotif.trim()) {
            toast("Le motif est obligatoire", "error");
            return;
          }
          justifyMutation.mutate({ id: selectedAbsence.id, motif: justifyMotif });
        }}
        loading={justifyMutation.isPending}
        submitLabel="Justifier"
      >
        <div className="space-y-2">
          <Label htmlFor="motif">Motif *</Label>
          <Input
            id="motif"
            value={justifyMotif}
            onChange={(e) => setJustifyMotif(e.target.value)}
            required
          />
        </div>
      </FormModal>
    </div>
  );
}
