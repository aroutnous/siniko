import { useMutation, useQuery } from "@tanstack/react-query";
import {
  Baby,
  BookOpen,
  Check,
  GraduationCap,
  Plus,
  Trash2,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { api, getErrorMessage } from "@/lib/api";
import { ROUTES } from "@/lib/constants";
import { ETABLISSEMENT_API } from "@/lib/etablissement-api";
import { parseCycleNotationFromValeur } from "@/lib/pedagogie-utils";
import { cn } from "@/lib/utils";
import { useToastStore } from "@/stores/toastStore";
import type {
  AnneeScolaire,
  Cycle,
  CycleUpdatePayload,
  ValeurSysteme,
  WizardEtablissementData,
  WizardEtablissementResponse,
} from "@/types";

const STEPS = [
  "Année",
  "Périodes",
  "Cycles",
  "Classes",
  "Salles",
  "Matières",
  "Notation par cycle",
] as const;

interface CycleNotationDraft {
  type_evaluation: "chiffree" | "qualitative";
  note_max: string;
  note_passage: string;
  arrondi: string;
}

type StepIndex = 0 | 1 | 2 | 3 | 4 | 5 | 6;

interface PeriodeDraft {
  enabled: boolean;
  date_debut: string;
  date_fin: string;
}

interface SalleDraft {
  localId: string;
  nom_salle: string;
  capacite: string;
}

interface MatiereDraft {
  localId: string;
  nom: string;
  coefficient: string;
}

function classeKey(cycle: string, classe: string): string {
  return `${cycle}::${classe}`;
}

function newLocalId(): string {
  return crypto.randomUUID();
}

const CYCLE_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  "Jardins d enfants": Baby,
  "1er Cycle": BookOpen,
  "2eme Cycle": GraduationCap,
};

function displayCycleLabel(valeur: string): string {
  if (valeur === "Jardins d enfants") return "Jardins d'enfants";
  if (valeur === "2eme Cycle") return "2ème Cycle";
  return valeur;
}

export function WizardEtablissementPage(): React.JSX.Element {
  const navigate = useNavigate();
  const toast = useToastStore((s) => s.show);

  const [step, setStep] = useState<StepIndex>(0);
  const [anneeScolaire, setAnneeScolaire] = useState("");
  const [periodes, setPeriodes] = useState<Record<string, PeriodeDraft>>({});
  const [cyclesSelectionnes, setCyclesSelectionnes] = useState<Set<string>>(new Set());
  const [classesSelectionnees, setClassesSelectionnees] = useState<Set<string>>(new Set());
  const [salles, setSalles] = useState<Record<string, SalleDraft[]>>({});
  const [matieres, setMatieres] = useState<Record<string, MatiereDraft[]>>({});
  const [cycleNotation, setCycleNotation] = useState<Record<string, CycleNotationDraft>>(
    {},
  );
  const [stepError, setStepError] = useState<string | null>(null);

  const { data: anneesValeurs = [], isLoading: loadingAnnees } = useQuery({
    queryKey: ["valeurs-annees-scolaires"],
    queryFn: async () => {
      const { data } = await api.get<ValeurSysteme[]>(ETABLISSEMENT_API.valeursAnnees);
      return data;
    },
  });

  const { data: anneeActive } = useQuery({
    queryKey: ["annee-active"],
    queryFn: async () => {
      const { data } = await api.get<AnneeScolaire>(ETABLISSEMENT_API.anneeActive);
      return data;
    },
    retry: false,
  });

  const { data: periodesValeurs = [], isLoading: loadingPeriodes } = useQuery({
    queryKey: ["valeurs-periodes"],
    queryFn: async () => {
      const { data } = await api.get<ValeurSysteme[]>(ETABLISSEMENT_API.valeursPeriodes);
      return data;
    },
  });

  const { data: cyclesValeurs = [], isLoading: loadingCycles } = useQuery({
    queryKey: ["valeurs-cycles"],
    queryFn: async () => {
      const { data } = await api.get<ValeurSysteme[]>(ETABLISSEMENT_API.valeursCycles);
      return data;
    },
  });

  const cyclesSorted = useMemo(
    () => [...cyclesValeurs].sort((a, b) => a.ordre - b.ordre),
    [cyclesValeurs],
  );

  const classesParCycleQueries = useMemo(
    () =>
      [...cyclesSelectionnes].map((cycle) => ({
        cycle,
        queryKey: ["valeurs-classes", cycle] as const,
      })),
    [cyclesSelectionnes],
  );

  const classesQueries = useQuery({
    queryKey: ["valeurs-classes-wizard", [...cyclesSelectionnes].sort().join(",")],
    queryFn: async () => {
      const entries: Record<string, ValeurSysteme[]> = {};
      await Promise.all(
        [...cyclesSelectionnes].map(async (cycle) => {
          const { data } = await api.get<ValeurSysteme[]>(
            ETABLISSEMENT_API.valeursClasses,
            { params: { cycle } },
          );
          entries[cycle] = data;
        }),
      );
      return entries;
    },
    enabled: cyclesSelectionnes.size > 0,
  });

  const selectedClassesList = useMemo(() => {
    const list: { cycle: string; classe: string; key: string }[] = [];
    const data = classesQueries.data ?? {};
    for (const cycle of cyclesSelectionnes) {
      for (const row of data[cycle] ?? []) {
        const key = classeKey(cycle, row.valeur);
        if (classesSelectionnees.has(key)) {
          list.push({ cycle, classe: row.valeur, key });
        }
      }
    }
    return list;
  }, [classesQueries.data, cyclesSelectionnes, classesSelectionnees]);

  const allWizardClassKeys = useMemo(() => {
    const data = classesQueries.data ?? {};
    const keys: string[] = [];
    for (const cycle of cyclesSelectionnes) {
      for (const row of data[cycle] ?? []) {
        keys.push(classeKey(cycle, row.valeur));
      }
    }
    return keys;
  }, [classesQueries.data, cyclesSelectionnes]);

  const allClassesSelected = useMemo(
    () =>
      allWizardClassKeys.length > 0 &&
      allWizardClassKeys.every((key) => classesSelectionnees.has(key)),
    [allWizardClassKeys, classesSelectionnees],
  );

  const getCycleClassKeys = (cycle: string): string[] =>
    (classesQueries.data?.[cycle] ?? []).map((classe) =>
      classeKey(cycle, classe.valeur),
    );

  const isCycleFullySelected = (cycle: string): boolean => {
    const keys = getCycleClassKeys(cycle);
    return keys.length > 0 && keys.every((key) => classesSelectionnees.has(key));
  };

  useEffect(() => {
    if (step !== 6) return;
    setCycleNotation((prev) => {
      const next = { ...prev };
      for (const cycleName of cyclesSelectionnes) {
        if (next[cycleName]) continue;
        const valeur = cyclesSorted.find((c) => c.valeur === cycleName);
        next[cycleName] = parseCycleNotationFromValeur(valeur?.metadata_json);
      }
      return next;
    });
  }, [step, cyclesSelectionnes, cyclesSorted]);

  const wizardMutation = useMutation({
    mutationFn: async ({
      payload,
      notations,
    }: {
      payload: WizardEtablissementData;
      notations: Record<string, CycleNotationDraft>;
    }) => {
      const { data } = await api.post<WizardEtablissementResponse>(
        ETABLISSEMENT_API.wizard,
        payload,
      );
      const { data: cycles } = await api.get<Cycle[]>(ETABLISSEMENT_API.cycles);
      await Promise.all(
        [...cyclesSelectionnes].map(async (cycleName) => {
          const cycle = cycles.find((c) => c.nom === cycleName);
          const notation = notations[cycleName];
          if (!cycle || !notation) return;
          const body: CycleUpdatePayload =
            notation.type_evaluation === "qualitative"
              ? {
                  type_evaluation: "qualitative",
                  note_max: null,
                  note_passage: null,
                  arrondi: null,
                }
              : {
                  type_evaluation: "chiffree",
                  note_max: Number(notation.note_max),
                  note_passage: Number(notation.note_passage),
                  arrondi: Number(notation.arrondi),
                };
          await api.put(`${ETABLISSEMENT_API.cycles}/${cycle.id}`, body);
        }),
      );
      return data;
    },
    onSuccess: (data) => {
      toast(data.message);
      navigate(ROUTES.dashboard);
    },
    onError: (err) => toast(getErrorMessage(err), "error"),
  });

  const initPeriodesIfNeeded = (): void => {
    if (Object.keys(periodes).length > 0) return;
    const next: Record<string, PeriodeDraft> = {};
    for (const p of periodesValeurs) {
      next[p.valeur] = { enabled: true, date_debut: "", date_fin: "" };
    }
    setPeriodes(next);
  };

  const toggleCycle = (cycle: string, checked: boolean): void => {
    setCyclesSelectionnes((prev) => {
      const next = new Set(prev);
      if (checked) next.add(cycle);
      else next.delete(cycle);
      return next;
    });
    if (!checked) {
      setClassesSelectionnees((prev) => {
        const next = new Set(prev);
        for (const key of prev) {
          if (key.startsWith(`${cycle}::`)) next.delete(key);
        }
        return next;
      });
    }
  };

  const ensureSalleDrafts = (keys: string[]): void => {
    if (keys.length === 0) return;
    setSalles((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const key of keys) {
        if (next[key]?.length) continue;
        next[key] = [{ localId: newLocalId(), nom_salle: "", capacite: "" }];
        changed = true;
      }
      return changed ? next : prev;
    });
  };

  const toggleClasse = (cycle: string, classe: string, checked: boolean): void => {
    const key = classeKey(cycle, classe);
    setClassesSelectionnees((prev) => {
      const next = new Set(prev);
      if (checked) next.add(key);
      else next.delete(key);
      return next;
    });
    if (checked) {
      ensureSalleDrafts([key]);
    }
  };

  const toggleAllClasses = (select: boolean): void => {
    setClassesSelectionnees((prev) => {
      const next = new Set(prev);
      for (const key of allWizardClassKeys) {
        if (select) next.add(key);
        else next.delete(key);
      }
      return next;
    });
    if (select) {
      ensureSalleDrafts(allWizardClassKeys);
    }
  };

  const toggleAllClassesForCycle = (cycle: string, select: boolean): void => {
    const keys = getCycleClassKeys(cycle);
    setClassesSelectionnees((prev) => {
      const next = new Set(prev);
      for (const key of keys) {
        if (select) next.add(key);
        else next.delete(key);
      }
      return next;
    });
    if (select) {
      ensureSalleDrafts(keys);
    }
  };

  const validateStep = (current: StepIndex): string | null => {
    switch (current) {
      case 0:
        if (!anneeScolaire) return "Sélectionnez une année scolaire.";
        return null;
      case 1: {
        const enabled = Object.entries(periodes).filter(([, p]) => p.enabled);
        if (enabled.length === 0) return "Cochez au moins une période.";
        for (const [nom, p] of enabled) {
          if (!p.date_debut || !p.date_fin) {
            return `Renseignez les dates pour ${nom}.`;
          }
          if (p.date_fin <= p.date_debut) {
            return `${nom} : la date de fin doit être après la date de début.`;
          }
        }
        return null;
      }
      case 2:
        if (cyclesSelectionnes.size === 0) return "Sélectionnez au moins un cycle.";
        return null;
      case 3:
        if (classesSelectionnees.size === 0) return "Sélectionnez au moins une classe.";
        return null;
      case 4:
        for (const { key, classe } of selectedClassesList) {
          const rows = salles[key] ?? [];
          if (rows.length === 0) {
            return `Ajoutez au moins une salle pour ${classe}.`;
          }
          for (const row of rows) {
            if (!row.nom_salle.trim()) {
              return `Nom de salle manquant pour ${classe}.`;
            }
            const cap = Number(row.capacite);
            if (!Number.isFinite(cap) || cap < 1) {
              return `Capacité invalide pour une salle de ${classe}.`;
            }
          }
        }
        return null;
      case 5:
        for (const { key, classe } of selectedClassesList) {
          for (const m of matieres[key] ?? []) {
            if (!m.nom.trim()) return `Nom de matière manquant pour ${classe}.`;
            const coef = Number(m.coefficient);
            if (!Number.isFinite(coef) || coef <= 0) {
              return `Coefficient invalide pour une matière de ${classe}.`;
            }
          }
        }
        return null;
      case 6: {
        for (const cycleName of cyclesSelectionnes) {
          const n = cycleNotation[cycleName];
          if (!n) {
            return `Notation manquante pour ${displayCycleLabel(cycleName)}.`;
          }
          if (n.type_evaluation === "qualitative") continue;
          const max = Number(n.note_max);
          const passage = Number(n.note_passage);
          if (!Number.isFinite(max) || max <= 0) {
            return `Note maximale invalide pour ${displayCycleLabel(cycleName)}.`;
          }
          if (!Number.isFinite(passage) || passage < 0) {
            return `Note de passage invalide pour ${displayCycleLabel(cycleName)}.`;
          }
          if (passage > max) {
            return `La note de passage dépasse la note max pour ${displayCycleLabel(cycleName)}.`;
          }
        }
        return null;
      }
      default:
        return null;
    }
  };

  const goNext = (): void => {
    const err = validateStep(step);
    if (err) {
      setStepError(err);
      return;
    }
    setStepError(null);
    if (step === 0) initPeriodesIfNeeded();
    if (step < 6) setStep((step + 1) as StepIndex);
  };

  const goPrev = (): void => {
    setStepError(null);
    if (step > 0) setStep((step - 1) as StepIndex);
  };

  const handleFinish = (): void => {
    const err = validateStep(6);
    if (err) {
      setStepError(err);
      return;
    }
    setStepError(null);

    const payload: WizardEtablissementData = {
      annee_scolaire: anneeScolaire,
      periodes: Object.entries(periodes)
        .filter(([, p]) => p.enabled)
        .map(([periode, p]) => ({
          periode,
          date_debut: p.date_debut,
          date_fin: p.date_fin,
        })),
      cycles_selectionnes: [...cyclesSelectionnes],
      classes_selectionnees: selectedClassesList.map(({ cycle, classe }) => ({
        cycle,
        classe,
      })),
      salles: selectedClassesList.flatMap(({ key, classe }) =>
        (salles[key] ?? []).map((s) => ({
          classe,
          nom_salle: s.nom_salle.trim(),
          capacite: Number(s.capacite),
        })),
      ),
      matieres: selectedClassesList.flatMap(({ key, classe }) =>
        (matieres[key] ?? [])
          .filter((m) => m.nom.trim())
          .map((m) => ({
            classe,
            nom: m.nom.trim(),
            coefficient: Number(m.coefficient),
          })),
      ),
    };

    wizardMutation.mutate({ payload, notations: cycleNotation });
  };

  if (loadingAnnees || loadingPeriodes || loadingCycles) {
    return <LoadingSpinner />;
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader
        title="Configuration de l'établissement"
        description="Assistant pas à pas pour structurer votre école"
      />

      <nav className="flex flex-wrap items-center gap-1 text-sm">
        {STEPS.map((label, index) => (
          <div key={label} className="flex items-center gap-1">
            {index > 0 ? <span className="text-muted-foreground">→</span> : null}
            <span
              className={cn(
                "rounded-full px-2.5 py-0.5",
                index === step
                  ? "bg-primary font-medium text-primary-foreground"
                  : index < step
                    ? "bg-muted text-foreground"
                    : "text-muted-foreground",
              )}
            >
              {label}
            </span>
          </div>
        ))}
      </nav>

      <Card>
        <CardHeader>
          <CardTitle>{STEPS[step]}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {step === 0 ? (
            <>
              {anneeActive ? (
                <div className="rounded-lg border border-border bg-muted/40 p-4">
                  <p className="text-sm text-muted-foreground">Année active actuelle</p>
                  <p className="font-medium">{anneeActive.libelle}</p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="mt-2"
                    onClick={() => setAnneeScolaire(anneeActive.libelle)}
                  >
                    Utiliser cette année
                  </Button>
                </div>
              ) : null}
              <div className="space-y-2">
                <Label htmlFor="annee">Année scolaire</Label>
                <Select
                  id="annee"
                  value={anneeScolaire}
                  onChange={(e) => setAnneeScolaire(e.target.value)}
                >
                  <option value="">Sélectionner une année</option>
                  {anneesValeurs.map((a) => (
                    <option key={a.id} value={a.valeur}>
                      {a.valeur}
                    </option>
                  ))}
                </Select>
              </div>
            </>
          ) : null}

          {step === 1 ? (
            <div className="space-y-4">
              {periodesValeurs.map((p) => {
                const draft = periodes[p.valeur] ?? {
                  enabled: false,
                  date_debut: "",
                  date_fin: "",
                };
                return (
                  <div key={p.id} className="rounded-lg border border-border p-4">
                    <label className="flex items-center gap-2 font-medium">
                      <Checkbox
                        checked={draft.enabled}
                        onCheckedChange={(checked) =>
                          setPeriodes((prev) => ({
                            ...prev,
                            [p.valeur]: {
                              ...(prev[p.valeur] ?? draft),
                              enabled: checked,
                            },
                          }))
                        }
                      />
                      {p.valeur}
                    </label>
                    {draft.enabled ? (
                      <div className="mt-3 grid gap-3 sm:grid-cols-2">
                        <div className="space-y-1">
                          <Label>Date début</Label>
                          <Input
                            type="date"
                            value={draft.date_debut}
                            onChange={(e) =>
                              setPeriodes((prev) => ({
                                ...prev,
                                [p.valeur]: { ...draft, date_debut: e.target.value },
                              }))
                            }
                          />
                        </div>
                        <div className="space-y-1">
                          <Label>Date fin</Label>
                          <Input
                            type="date"
                            value={draft.date_fin}
                            onChange={(e) =>
                              setPeriodes((prev) => ({
                                ...prev,
                                [p.valeur]: { ...draft, date_fin: e.target.value },
                              }))
                            }
                          />
                        </div>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          ) : null}

          {step === 2 ? (
            <div className="space-y-3">
              {cyclesSorted.map((cycle) => {
                const Icon = CYCLE_ICONS[cycle.valeur] ?? BookOpen;
                const checked = cyclesSelectionnes.has(cycle.valeur);
                return (
                  <label
                    key={cycle.id}
                    className="flex cursor-pointer items-center gap-3 rounded-lg border border-border p-4 hover:bg-muted/40"
                  >
                    <Checkbox
                      checked={checked}
                      onCheckedChange={(c) => toggleCycle(cycle.valeur, c)}
                    />
                    <Icon className="h-5 w-5 text-primary" />
                    <span className="font-medium">{displayCycleLabel(cycle.valeur)}</span>
                  </label>
                );
              })}
            </div>
          ) : null}

          {step === 3 ? (
            <div className="space-y-6">
              {classesParCycleQueries.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Sélectionnez des cycles à l&apos;étape précédente.
                </p>
              ) : classesQueries.isLoading ? (
                <LoadingSpinner label="Chargement des classes…" />
              ) : (
                <>
                  {allWizardClassKeys.length > 0 ? (
                    <div className="flex justify-end">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => toggleAllClasses(!allClassesSelected)}
                      >
                        {allClassesSelected ? "Tout désélectionner" : "Tout sélectionner"}
                      </Button>
                    </div>
                  ) : null}
                  {[...cyclesSelectionnes].map((cycle) => {
                    const cycleFullySelected = isCycleFullySelected(cycle);
                    const cycleClassKeys = getCycleClassKeys(cycle);
                    return (
                  <div key={cycle}>
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                      <h3 className="font-medium">{displayCycleLabel(cycle)}</h3>
                      {cycleClassKeys.length > 0 ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            toggleAllClassesForCycle(cycle, !cycleFullySelected)
                          }
                        >
                          {cycleFullySelected
                            ? "Tout désélectionner"
                            : "Tout sélectionner"}
                        </Button>
                      ) : null}
                    </div>
                    <div className="space-y-2">
                      {(classesQueries.data?.[cycle] ?? []).map((classe) => {
                        const key = classeKey(cycle, classe.valeur);
                        return (
                          <label
                            key={classe.id}
                            className="flex items-center gap-2 rounded bg-muted/30 px-3 py-2"
                          >
                            <Checkbox
                              checked={classesSelectionnees.has(key)}
                              onCheckedChange={(c) =>
                                toggleClasse(cycle, classe.valeur, c)
                              }
                            />
                            {classe.valeur}
                          </label>
                        );
                      })}
                    </div>
                  </div>
                    );
                  })}
                </>
              )}
            </div>
          ) : null}

          {step === 4 ? (
            <div className="space-y-6">
              {selectedClassesList.map(({ key, classe }) => (
                <div key={key} className="rounded-lg border border-border p-4">
                  <h3 className="mb-3 font-medium">{classe}</h3>
                  <div className="space-y-2">
                    {(salles[key] ?? []).map((salle) => (
                      <div key={salle.localId} className="flex flex-wrap items-end gap-2">
                        <div className="min-w-[140px] flex-1 space-y-1">
                          <Label>Nom salle</Label>
                          <Input
                            value={salle.nom_salle}
                            placeholder="Salle A"
                            onChange={(e) =>
                              setSalles((prev) => ({
                                ...prev,
                                [key]: (prev[key] ?? []).map((s) =>
                                  s.localId === salle.localId
                                    ? { ...s, nom_salle: e.target.value }
                                    : s,
                                ),
                              }))
                            }
                          />
                        </div>
                        <div className="w-28 space-y-1">
                          <Label>Capacité</Label>
                          <Input
                            type="number"
                            min="1"
                            value={salle.capacite}
                            onChange={(e) =>
                              setSalles((prev) => ({
                                ...prev,
                                [key]: (prev[key] ?? []).map((s) =>
                                  s.localId === salle.localId
                                    ? { ...s, capacite: e.target.value }
                                    : s,
                                ),
                              }))
                            }
                          />
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-9 w-9 shrink-0 px-0"
                          disabled={(salles[key] ?? []).length <= 1}
                          onClick={() =>
                            setSalles((prev) => ({
                              ...prev,
                              [key]: (prev[key] ?? []).filter(
                                (s) => s.localId !== salle.localId,
                              ),
                            }))
                          }
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="mt-3"
                    onClick={() =>
                      setSalles((prev) => ({
                        ...prev,
                        [key]: [
                          ...(prev[key] ?? []),
                          { localId: newLocalId(), nom_salle: "", capacite: "" },
                        ],
                      }))
                    }
                  >
                    <Plus className="mr-1 h-4 w-4" />
                    Ajouter une salle
                  </Button>
                </div>
              ))}
            </div>
          ) : null}

          {step === 5 ? (
            <div className="space-y-6">
              {selectedClassesList.map(({ key, classe }) => (
                <div key={key} className="rounded-lg border border-border p-4">
                  <h3 className="mb-3 font-medium">{classe}</h3>
                  <div className="space-y-2">
                    {(matieres[key] ?? []).map((matiere) => (
                      <div key={matiere.localId} className="flex flex-wrap items-end gap-2">
                        <div className="min-w-[140px] flex-1 space-y-1">
                          <Label>Matière</Label>
                          <Input
                            value={matiere.nom}
                            placeholder="Français"
                            onChange={(e) =>
                              setMatieres((prev) => ({
                                ...prev,
                                [key]: (prev[key] ?? []).map((m) =>
                                  m.localId === matiere.localId
                                    ? { ...m, nom: e.target.value }
                                    : m,
                                ),
                              }))
                            }
                          />
                        </div>
                        <div className="w-24 space-y-1">
                          <Label>Coef.</Label>
                          <Input
                            type="number"
                            min="0.01"
                            step="0.01"
                            value={matiere.coefficient}
                            onChange={(e) =>
                              setMatieres((prev) => ({
                                ...prev,
                                [key]: (prev[key] ?? []).map((m) =>
                                  m.localId === matiere.localId
                                    ? { ...m, coefficient: e.target.value }
                                    : m,
                                ),
                              }))
                            }
                          />
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-9 w-9 shrink-0 px-0"
                          onClick={() =>
                            setMatieres((prev) => ({
                              ...prev,
                              [key]: (prev[key] ?? []).filter(
                                (m) => m.localId !== matiere.localId,
                              ),
                            }))
                          }
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="mt-3"
                    onClick={() =>
                      setMatieres((prev) => ({
                        ...prev,
                        [key]: [
                          ...(prev[key] ?? []),
                          { localId: newLocalId(), nom: "", coefficient: "1" },
                        ],
                      }))
                    }
                  >
                    <Plus className="mr-1 h-4 w-4" />
                    Ajouter une matière
                  </Button>
                </div>
              ))}
            </div>
          ) : null}

          {step === 6 ? (
            <div className="space-y-6">
              <p className="text-sm text-muted-foreground">
                La notation est définie par cycle. Les valeurs par défaut proviennent du
                référentiel système ; vous pouvez les ajuster avant de terminer.
              </p>
              {[...cyclesSelectionnes].map((cycleName) => {
                const draft = cycleNotation[cycleName];
                if (!draft) return null;
                const isQualitative = draft.type_evaluation === "qualitative";
                return (
                  <div key={cycleName} className="rounded-lg border border-border p-4">
                    <h3 className="mb-3 font-medium">{displayCycleLabel(cycleName)}</h3>
                    {isQualitative ? (
                      <p className="text-sm text-muted-foreground">
                        Évaluation qualitative — pas de notes chiffrées ni de moyenne pour ce
                        cycle.
                      </p>
                    ) : (
                      <div className="grid gap-4 sm:grid-cols-3">
                        <div className="space-y-2">
                          <Label>Note maximale</Label>
                          <Input
                            type="number"
                            min="1"
                            step="0.01"
                            value={draft.note_max}
                            onChange={(e) =>
                              setCycleNotation((prev) => ({
                                ...prev,
                                [cycleName]: { ...draft, note_max: e.target.value },
                              }))
                            }
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Note de passage</Label>
                          <Input
                            type="number"
                            min="0"
                            step="0.01"
                            value={draft.note_passage}
                            onChange={(e) =>
                              setCycleNotation((prev) => ({
                                ...prev,
                                [cycleName]: { ...draft, note_passage: e.target.value },
                              }))
                            }
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Arrondi (décimales)</Label>
                          <Select
                            value={draft.arrondi}
                            onChange={(e) =>
                              setCycleNotation((prev) => ({
                                ...prev,
                                [cycleName]: { ...draft, arrondi: e.target.value },
                              }))
                            }
                          >
                            <option value="0">0 décimale</option>
                            <option value="1">1 décimale</option>
                            <option value="2">2 décimales</option>
                          </Select>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : null}

          {stepError ? (
            <p className="text-sm text-destructive" role="alert">
              {stepError}
            </p>
          ) : null}
        </CardContent>
      </Card>

      <div className="flex justify-between">
        <Button type="button" variant="outline" disabled={step === 0} onClick={goPrev}>
          Précédent
        </Button>
        {step < 6 ? (
          <Button type="button" onClick={goNext}>
            Suivant
          </Button>
        ) : (
          <Button
            type="button"
            disabled={wizardMutation.isPending}
            onClick={handleFinish}
          >
            <Check className="mr-2 h-4 w-4" />
            Terminer la configuration
          </Button>
        )}
      </div>
    </div>
  );
}
