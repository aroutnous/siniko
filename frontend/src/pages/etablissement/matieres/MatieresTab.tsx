import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Award,
  BookOpen,
  ChevronDown,
  ChevronRight,
  GraduationCap,
  Pencil,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import { useMemo, useState } from "react";

import { FormModal } from "@/components/etablissement/FormModal";
import { Badge } from "@/components/ui/badge";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { useMenuAccess } from "@/hooks/useMenuAccess";
import { api, getErrorMessage } from "@/lib/api";
import { displayCycleLabel, getClasseAbbreviation } from "@/lib/etablissement-utils";
import { ENSEIGNANTS_API } from "@/lib/enseignants-api";
import { ETABLISSEMENT_API } from "@/lib/etablissement-api";
import { cn } from "@/lib/utils";
import { useToastStore } from "@/stores/toastStore";
import type { ClasseNiveau, Cycle, Enseignant, Matiere } from "@/types";

interface MatiereForm {
  nom: string;
  classe_id: string;
  coefficient: string;
  note_max: string;
  est_obligatoire: boolean;
  est_domaine_competence: boolean;
  ordre: string;
  est_active: boolean;
  enseignant_principal_id: string;
  enseignant_assistant_id: string;
}

interface CycleGroup {
  cycle: Cycle;
  classes: Array<{
    classe: ClasseNiveau;
    matieres: Matiere[];
  }>;
  classCount: number;
  matiereCount: number;
}

const INITIAL: MatiereForm = {
  nom: "",
  classe_id: "",
  coefficient: "1",
  note_max: "",
  est_obligatoire: true,
  est_domaine_competence: false,
  ordre: "0",
  est_active: true,
  enseignant_principal_id: "",
  enseignant_assistant_id: "",
};

function formatEnseignant(e: Enseignant): string {
  return `${e.prenom} ${e.nom}`.trim();
}

function toPayload(form: MatiereForm): Record<string, unknown> {
  return {
    nom: form.nom,
    classe_id: form.classe_id,
    coefficient: Number(form.coefficient),
    note_max: form.note_max.trim() ? Number(form.note_max) : null,
    est_obligatoire: form.est_obligatoire,
    est_domaine_competence: form.est_domaine_competence,
    ordre: Number(form.ordre) || 0,
    est_active: form.est_active,
    enseignant_principal_id: form.enseignant_principal_id || null,
    enseignant_assistant_id: form.enseignant_assistant_id || null,
  };
}

function matiereToForm(m: Matiere): MatiereForm {
  return {
    nom: m.nom,
    classe_id: m.classe_id,
    coefficient: String(m.coefficient),
    note_max: m.note_max != null ? String(m.note_max) : "",
    est_obligatoire: m.est_obligatoire,
    est_domaine_competence: m.est_domaine_competence,
    ordre: String(m.ordre),
    est_active: m.est_active,
    enseignant_principal_id: m.enseignant_principal_id ?? "",
    enseignant_assistant_id: m.enseignant_assistant_id ?? "",
  };
}

export function MatieresTab(): React.JSX.Element {
  const queryClient = useQueryClient();
  const toast = useToastStore((s) => s.show);
  const { can } = useMenuAccess();
  const canConfigure = can.etablissementConfigurer;

  const [selectedCycleId, setSelectedCycleId] = useState<string | null>(null);
  const [expandedClasses, setExpandedClasses] = useState<Record<string, boolean>>({});
  const [searchQuery, setSearchQuery] = useState("");
  const [enseignantFilterId, setEnseignantFilterId] = useState("");
  const [open, setOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Matiere | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Matiere | null>(null);
  const [form, setForm] = useState<MatiereForm>(INITIAL);

  const { data: cycles = [], isLoading: loadingCycles } = useQuery({
    queryKey: ["cycles"],
    queryFn: async () => {
      const { data } = await api.get<Cycle[]>(ETABLISSEMENT_API.cycles);
      return data;
    },
  });

  const { data: classesNiveau = [], isLoading: loadingClasses } = useQuery({
    queryKey: ["classes-niveau"],
    queryFn: async () => {
      const { data } = await api.get<ClasseNiveau[]>(ETABLISSEMENT_API.classesNiveau);
      return data;
    },
  });

  const { data: enseignants = [], isLoading: loadingEnseignants } = useQuery({
    queryKey: ["enseignants"],
    queryFn: async () => {
      const { data } = await api.get<Enseignant[]>(ENSEIGNANTS_API.list);
      return data;
    },
  });

  const { data: matieres = [], isLoading: loadingMatieres } = useQuery({
    queryKey: ["matieres"],
    queryFn: async () => {
      const { data } = await api.get<Matiere[]>(ETABLISSEMENT_API.matieres);
      return data;
    },
  });

  const classesById = useMemo(
    () => new Map(classesNiveau.map((c) => [c.id, c])),
    [classesNiveau],
  );

  const cyclesById = useMemo(() => new Map(cycles.map((c) => [c.id, c])), [cycles]);

  const grouped = useMemo((): CycleGroup[] => {
    const matieresByClasse = new Map<string, Matiere[]>();
    for (const matiere of matieres) {
      const list = matieresByClasse.get(matiere.classe_id) ?? [];
      list.push(matiere);
      matieresByClasse.set(matiere.classe_id, list);
    }

    const classesByCycle = new Map<string, ClasseNiveau[]>();
    for (const classe of classesNiveau) {
      const list = classesByCycle.get(classe.cycle_id) ?? [];
      list.push(classe);
      classesByCycle.set(classe.cycle_id, list);
    }

    const sortedCycles = [...cycles].sort(
      (a, b) => a.ordre - b.ordre || a.nom.localeCompare(b.nom, "fr"),
    );

    return sortedCycles.map((cycle) => {
      const classes = (classesByCycle.get(cycle.id) ?? []).sort(
        (a, b) => a.ordre - b.ordre || a.nom.localeCompare(b.nom, "fr"),
      );
      const classGroups = classes.map((classe) => ({
        classe,
        matieres: (matieresByClasse.get(classe.id) ?? []).sort(
          (a, b) => a.ordre - b.ordre || a.nom.localeCompare(b.nom, "fr"),
        ),
      }));
      const matiereCount = classGroups.reduce((sum, g) => sum + g.matieres.length, 0);

      return {
        cycle,
        classes: classGroups,
        classCount: classes.length,
        matiereCount,
      };
    });
  }, [cycles, classesNiveau, matieres]);

  const selectedCycleGroup = useMemo(
    () => grouped.find((g) => g.cycle.id === selectedCycleId) ?? null,
    [grouped, selectedCycleId],
  );

  const filteredClasses = useMemo(() => {
    if (!selectedCycleGroup) return [];

    const query = searchQuery.trim().toLowerCase();

    return selectedCycleGroup.classes.map(({ classe, matieres: classeMatieres }) => {
      let filtered = classeMatieres;

      if (query) {
        filtered = filtered.filter((m) => m.nom.toLowerCase().includes(query));
      }
      if (enseignantFilterId) {
        filtered = filtered.filter((m) => m.enseignant_principal_id === enseignantFilterId);
      }

      return {
        classe,
        matieres: filtered,
        totalCount: classeMatieres.length,
      };
    });
  }, [selectedCycleGroup, searchQuery, enseignantFilterId]);

  const enseignantsInCycle = useMemo(() => {
    if (!selectedCycleGroup) return [];

    const ids = new Set<string>();
    for (const { matieres: classeMatieres } of selectedCycleGroup.classes) {
      for (const m of classeMatieres) {
        if (m.enseignant_principal_id) ids.add(m.enseignant_principal_id);
      }
    }

    return enseignants
      .filter((e) => e.statut === "actif" && ids.has(e.id))
      .sort((a, b) => formatEnseignant(a).localeCompare(formatEnseignant(b), "fr"));
  }, [selectedCycleGroup, enseignants]);

  const selectedClasse = form.classe_id ? classesById.get(form.classe_id) : undefined;
  const selectedCycle = selectedClasse
    ? cyclesById.get(selectedClasse.cycle_id)
    : undefined;

  const enseignantOptions = enseignants.filter((e) => e.statut === "actif");

  const saveMutation = useMutation({
    mutationFn: async ({ payload, id }: { payload: MatiereForm; id?: string }) => {
      const body = toPayload(payload);
      if (id) {
        const { data } = await api.put<Matiere>(
          `${ETABLISSEMENT_API.matieres}/${id}`,
          body,
        );
        return data;
      }
      const { data } = await api.post<Matiere>(ETABLISSEMENT_API.matieres, body);
      return data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["matieres"] });
      toast(editTarget ? "Matière modifiée" : "Matière créée");
      setOpen(false);
      setEditTarget(null);
      setForm(INITIAL);
    },
    onError: (err) => toast(getErrorMessage(err), "error"),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`${ETABLISSEMENT_API.matieres}/${id}`);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["matieres"] });
      toast("Matière supprimée");
      setDeleteTarget(null);
    },
    onError: (err) => toast(getErrorMessage(err), "error"),
  });

  const enterCycle = (cycleId: string): void => {
    const cycleGroup = grouped.find((g) => g.cycle.id === cycleId);
    if (!cycleGroup) return;

    const expanded: Record<string, boolean> = {};
    for (const { classe } of cycleGroup.classes) {
      expanded[classe.id] = true;
    }

    setSelectedCycleId(cycleId);
    setExpandedClasses(expanded);
    setSearchQuery("");
    setEnseignantFilterId("");
  };

  const leaveCycle = (): void => {
    setSelectedCycleId(null);
    setExpandedClasses({});
    setSearchQuery("");
    setEnseignantFilterId("");
  };

  const toggleClass = (classeId: string): void => {
    setExpandedClasses((prev) => ({ ...prev, [classeId]: !prev[classeId] }));
  };

  const openAddForClasse = (classeId: string): void => {
    setEditTarget(null);
    setForm({ ...INITIAL, classe_id: classeId });
    setOpen(true);
  };

  const openEdit = (matiere: Matiere): void => {
    setEditTarget(matiere);
    setForm(matiereToForm(matiere));
    setOpen(true);
  };

  if (loadingCycles || loadingClasses || loadingMatieres || loadingEnseignants) {
    return <LoadingSpinner />;
  }

  const hasActiveFilters = Boolean(searchQuery.trim() || enseignantFilterId);

  return (
    <div>
      {selectedCycleGroup ? (
        <CycleDetailView
          cycleGroup={selectedCycleGroup}
          filteredClasses={filteredClasses}
          expandedClasses={expandedClasses}
          searchQuery={searchQuery}
          enseignantFilterId={enseignantFilterId}
          enseignantsInCycle={enseignantsInCycle}
          hasActiveFilters={hasActiveFilters}
          canConfigure={canConfigure}
          onBack={leaveCycle}
          onSearchChange={setSearchQuery}
          onEnseignantFilterChange={setEnseignantFilterId}
          onToggleClass={toggleClass}
          onAddForClasse={openAddForClasse}
          onEdit={openEdit}
          onDelete={setDeleteTarget}
        />
      ) : (
        <CyclesOverview
          grouped={grouped}
          onEnterCycle={enterCycle}
        />
      )}

      <FormModal
        open={open}
        title={editTarget ? "Modifier la matière" : "Ajouter une matière"}
        onClose={() => {
          setOpen(false);
          setEditTarget(null);
        }}
        onSubmit={() => saveMutation.mutate({ payload: form, id: editTarget?.id })}
        loading={saveMutation.isPending}
        submitLabel={editTarget ? "Enregistrer" : "Créer"}
      >
        <MatiereFormFields
          form={form}
          setForm={setForm}
          grouped={grouped}
          selectedCycle={selectedCycle}
          enseignantOptions={enseignantOptions}
          lockClasse={Boolean(form.classe_id && !editTarget)}
        />
      </FormModal>

      <Dialog open={Boolean(deleteTarget)} onClose={() => setDeleteTarget(null)}>
        <h2 className="mb-2 text-lg font-semibold">Supprimer cette matière ?</h2>
        <p className="mb-4 text-sm text-muted-foreground">
          Les notes associées seront conservées.
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setDeleteTarget(null)}>
            Annuler
          </Button>
          <Button
            variant="destructive"
            disabled={deleteMutation.isPending}
            onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
          >
            Supprimer
          </Button>
        </div>
      </Dialog>
    </div>
  );
}

interface CyclesOverviewProps {
  grouped: CycleGroup[];
  onEnterCycle: (cycleId: string) => void;
}

function CyclesOverview({ grouped, onEnterCycle }: CyclesOverviewProps): React.JSX.Element {
  if (grouped.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
        Aucun cycle configuré. Configurez d&apos;abord la structure de l&apos;établissement.
      </p>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {grouped.map(({ cycle, classCount, matiereCount }) => (
        <Card key={cycle.id} className="flex flex-col">
          <CardHeader className="pb-3">
            <div className="flex items-start gap-3">
              <div className="rounded-lg bg-primary/10 p-2.5 text-primary">
                <BookOpen className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <CardTitle className="text-base">
                  {displayCycleLabel(cycle.nom)}
                </CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">
                  {classCount} classe{classCount > 1 ? "s" : ""} · {matiereCount} matière
                  {matiereCount > 1 ? "s" : ""}
                </p>
              </div>
            </div>
          </CardHeader>
          <CardContent className="mt-auto pt-0">
            <div className="flex items-center justify-between gap-3">
              <div className="flex gap-2">
                <Badge variant="muted">
                  <GraduationCap className="mr-1 h-3 w-3" />
                  {classCount}
                </Badge>
                <Badge variant="muted">{matiereCount} mat.</Badge>
              </div>
              <Button size="sm" onClick={() => onEnterCycle(cycle.id)}>
                Voir
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

interface CycleDetailViewProps {
  cycleGroup: CycleGroup;
  filteredClasses: Array<{
    classe: ClasseNiveau;
    matieres: Matiere[];
    totalCount: number;
  }>;
  expandedClasses: Record<string, boolean>;
  searchQuery: string;
  enseignantFilterId: string;
  enseignantsInCycle: Enseignant[];
  hasActiveFilters: boolean;
  canConfigure: boolean;
  onBack: () => void;
  onSearchChange: (value: string) => void;
  onEnseignantFilterChange: (value: string) => void;
  onToggleClass: (classeId: string) => void;
  onAddForClasse: (classeId: string) => void;
  onEdit: (matiere: Matiere) => void;
  onDelete: (matiere: Matiere) => void;
}

function CycleDetailView({
  cycleGroup,
  filteredClasses,
  expandedClasses,
  searchQuery,
  enseignantFilterId,
  enseignantsInCycle,
  hasActiveFilters,
  canConfigure,
  onBack,
  onSearchChange,
  onEnseignantFilterChange,
  onToggleClass,
  onAddForClasse,
  onEdit,
  onDelete,
}: CycleDetailViewProps): React.JSX.Element {
  const { cycle } = cycleGroup;
  const visibleMatiereCount = filteredClasses.reduce((sum, g) => sum + g.matieres.length, 0);

  return (
    <div className="space-y-4">
      <Button type="button" variant="ghost" size="sm" className="-ml-2" onClick={onBack}>
        <ArrowLeft className="mr-2 h-4 w-4" />
        Retour aux cycles
      </Button>

      <nav
        aria-label="Fil d'Ariane"
        className="flex items-center gap-1.5 text-sm text-muted-foreground"
      >
        <button
          type="button"
          onClick={onBack}
          className="transition-colors hover:text-foreground"
        >
          Matières
        </button>
        <ChevronRight className="h-4 w-4 shrink-0" />
        <span className="font-medium text-foreground">
          {displayCycleLabel(cycle.nom)}
        </span>
      </nav>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Rechercher une matière…"
            className="pl-9"
            aria-label="Rechercher une matière"
          />
        </div>
        <div className="w-full sm:w-56">
          <Select
            value={enseignantFilterId}
            onChange={(e) => onEnseignantFilterChange(e.target.value)}
            aria-label="Filtrer par enseignant"
          >
            <option value="">Tous les enseignants</option>
            {enseignantsInCycle.map((e) => (
              <option key={e.id} value={e.id}>
                {formatEnseignant(e)}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {hasActiveFilters ? (
        <p className="text-sm text-muted-foreground">
          {visibleMatiereCount} matière{visibleMatiereCount > 1 ? "s" : ""} correspondante
          {visibleMatiereCount > 1 ? "s" : ""}
        </p>
      ) : null}

      <div className="space-y-3">
        {filteredClasses.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
            Aucune classe dans ce cycle.
          </p>
        ) : (
          filteredClasses.map(({ classe, matieres: classeMatieres, totalCount }) => (
            <ClasseAccordion
              key={classe.id}
              classe={classe}
              matieres={classeMatieres}
              totalCount={totalCount}
              expanded={expandedClasses[classe.id] ?? false}
              hasActiveFilters={hasActiveFilters}
              canConfigure={canConfigure}
              onToggle={() => onToggleClass(classe.id)}
              onAdd={() => onAddForClasse(classe.id)}
              onEdit={onEdit}
              onDelete={onDelete}
            />
          ))
        )}
      </div>
    </div>
  );
}

interface ClasseAccordionProps {
  classe: ClasseNiveau;
  matieres: Matiere[];
  totalCount: number;
  expanded: boolean;
  hasActiveFilters: boolean;
  canConfigure: boolean;
  onToggle: () => void;
  onAdd: () => void;
  onEdit: (matiere: Matiere) => void;
  onDelete: (matiere: Matiere) => void;
}

function ClasseAccordion({
  classe,
  matieres,
  totalCount,
  expanded,
  hasActiveFilters,
  canConfigure,
  onToggle,
  onAdd,
  onEdit,
  onDelete,
}: ClasseAccordionProps): React.JSX.Element {
  const countLabel = hasActiveFilters
    ? `${matieres.length} / ${totalCount}`
    : String(totalCount);

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card">
      <div className="flex items-center gap-2 px-4 py-3">
        <button
          type="button"
          onClick={onToggle}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
          aria-expanded={expanded}
        >
          <ChevronDown
            className={cn(
              "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
              expanded ? "rotate-0" : "-rotate-90",
            )}
          />
          <GraduationCap className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="truncate font-medium">{classe.nom}</span>
          <Badge variant="muted" className="ml-1 shrink-0">
            {countLabel} mat.
          </Badge>
        </button>
        {canConfigure ? (
          <Button type="button" size="sm" variant="outline" onClick={onAdd}>
            <Plus className="mr-1 h-4 w-4" />
            Ajouter
          </Button>
        ) : null}
      </div>

      {expanded ? (
        <div className="border-t border-border">
          {matieres.length === 0 ? (
            <p className="px-4 py-4 text-sm text-muted-foreground">
              {hasActiveFilters
                ? "Aucune matière ne correspond aux filtres."
                : "Aucune matière pour cette classe."}
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {matieres.map((matiere) => (
                <MatiereRow
                  key={matiere.id}
                  matiere={matiere}
                  canConfigure={canConfigure}
                  onEdit={() => onEdit(matiere)}
                  onDelete={() => onDelete(matiere)}
                />
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}

interface MatiereRowProps {
  matiere: Matiere;
  canConfigure: boolean;
  onEdit: () => void;
  onDelete: () => void;
}

function MatiereRow({
  matiere,
  canConfigure,
  onEdit,
  onDelete,
}: MatiereRowProps): React.JSX.Element {
  return (
    <li className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          {matiere.est_domaine_competence ? (
            <span title="Domaine de compétence">
              <Award className="h-4 w-4 shrink-0 text-amber-600" aria-hidden />
            </span>
          ) : null}
          <span className="font-medium">{matiere.nom}</span>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
          <span>Coef. {matiere.coefficient}</span>
          <span>
            {matiere.enseignant_principal_nom ?? "Sans enseignant principal"}
          </span>
        </div>
      </div>
      {canConfigure ? (
        <div className="flex shrink-0 gap-2">
          <Button type="button" size="sm" variant="outline" onClick={onEdit}>
            <Pencil className="mr-1 h-4 w-4" />
            Éditer
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={onDelete}>
            <Trash2 className="mr-1 h-4 w-4" />
            Supprimer
          </Button>
        </div>
      ) : null}
    </li>
  );
}

interface MatiereFormFieldsProps {
  form: MatiereForm;
  setForm: React.Dispatch<React.SetStateAction<MatiereForm>>;
  grouped: CycleGroup[];
  selectedCycle: Cycle | undefined;
  enseignantOptions: Enseignant[];
  lockClasse: boolean;
}

function MatiereFormFields({
  form,
  setForm,
  grouped,
  selectedCycle,
  enseignantOptions,
  lockClasse,
}: MatiereFormFieldsProps): React.JSX.Element {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="classe_id">Classe</Label>
        <Select
          id="classe_id"
          value={form.classe_id}
          onChange={(e) => setForm((p) => ({ ...p, classe_id: e.target.value }))}
          required
          disabled={lockClasse}
        >
          <option value="">Sélectionner</option>
          {grouped.map(({ cycle, classes }) => (
            <optgroup key={cycle.id} label={displayCycleLabel(cycle.nom)}>
              {classes.map(({ classe }) => (
                <option key={classe.id} value={classe.id}>
                  {getClasseAbbreviation(classe.nom)}
                </option>
              ))}
            </optgroup>
          ))}
        </Select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="cycle_nom">Cycle</Label>
        <Input id="cycle_nom" value={selectedCycle?.nom ?? ""} readOnly disabled />
      </div>
      <div className="space-y-2">
        <Label htmlFor="nom">Nom</Label>
        <Input
          id="nom"
          value={form.nom}
          onChange={(e) => setForm((p) => ({ ...p, nom: e.target.value }))}
          required
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="coefficient">Coefficient</Label>
          <Input
            id="coefficient"
            type="number"
            min="0.1"
            step="0.1"
            value={form.coefficient}
            onChange={(e) => setForm((p) => ({ ...p, coefficient: e.target.value }))}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="note_max">Note max</Label>
          <Input
            id="note_max"
            type="number"
            min="0.1"
            step="0.1"
            value={form.note_max}
            onChange={(e) => setForm((p) => ({ ...p, note_max: e.target.value }))}
            placeholder={
              selectedCycle?.note_max != null
                ? `Hérite du cycle (${selectedCycle.note_max})`
                : "Hérite du cycle"
            }
          />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="ordre">Ordre (bulletin)</Label>
        <Input
          id="ordre"
          type="number"
          min="0"
          value={form.ordre}
          onChange={(e) => setForm((p) => ({ ...p, ordre: e.target.value }))}
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="enseignant_principal_id">Enseignant principal</Label>
          <Select
            id="enseignant_principal_id"
            value={form.enseignant_principal_id}
            onChange={(e) =>
              setForm((p) => ({ ...p, enseignant_principal_id: e.target.value }))
            }
          >
            <option value="">Aucun</option>
            {enseignantOptions.map((e) => (
              <option key={e.id} value={e.id}>
                {formatEnseignant(e)}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="enseignant_assistant_id">Enseignant assistant</Label>
          <Select
            id="enseignant_assistant_id"
            value={form.enseignant_assistant_id}
            onChange={(e) =>
              setForm((p) => ({ ...p, enseignant_assistant_id: e.target.value }))
            }
          >
            <option value="">Aucun</option>
            {enseignantOptions.map((e) => (
              <option key={e.id} value={e.id}>
                {formatEnseignant(e)}
              </option>
            ))}
          </Select>
        </div>
      </div>
      <div className="flex flex-wrap gap-4">
        <label className="flex items-center gap-2 text-sm">
          <Checkbox
            checked={form.est_obligatoire}
            onChange={(e) =>
              setForm((p) => ({ ...p, est_obligatoire: e.target.checked }))
            }
          />
          Matière obligatoire
        </label>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox
            checked={form.est_domaine_competence}
            onChange={(e) =>
              setForm((p) => ({ ...p, est_domaine_competence: e.target.checked }))
            }
          />
          Domaine de compétence
        </label>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox
            checked={form.est_active}
            onChange={(e) => setForm((p) => ({ ...p, est_active: e.target.checked }))}
          />
          Active
        </label>
      </div>
    </div>
  );
}
