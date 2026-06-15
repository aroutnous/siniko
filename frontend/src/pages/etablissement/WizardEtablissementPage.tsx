import { useMutation, useQuery } from "@tanstack/react-query";
import {
  Baby,
  BookOpen,
  Check,
  GraduationCap,
  Plus,
  Trash2,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
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
  ValeurSysteme,
  WizardEtablissementData,
  WizardEtablissementResponse,
} from "@/types";

const STEPS = ["Année", "Périodes", "Cycles", "Classes", "Salles"] as const;

type StepIndex = 0 | 1 | 2 | 3 | 4;

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

function classeKey(cycle: string, classe: string): string {
  return `${cycle}::${classe}`;
}

function newLocalId(): string {
  return crypto.randomUUID();
}

function createSalleDraft(): SalleDraft {
  return { localId: newLocalId(), nom_salle: "", capacite: "" };
}

/** Clone profond : chaque classe possède son propre tableau et chaque salle son propre objet. */
function cloneSallesRecord(
  prev: Record<string, SalleDraft[]>,
): Record<string, SalleDraft[]> {
  const next: Record<string, SalleDraft[]> = {};
  for (const [classeKey, rows] of Object.entries(prev)) {
    next[classeKey] = rows.map((s) => ({ ...s }));
  }
  return next;
}

function updateSalleField(
  prev: Record<string, SalleDraft[]>,
  classeKey: string,
  localId: string,
  patch: Partial<Pick<SalleDraft, "nom_salle" | "capacite">>,
): Record<string, SalleDraft[]> {
  const rows = prev[classeKey];
  if (!rows) return prev;

  const next = cloneSallesRecord(prev);
  next[classeKey] = (next[classeKey] ?? []).map((s) =>
    s.localId === localId ? { ...s, ...patch } : { ...s },
  );
  return next;
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
  const [stepError, setStepError] = useState<string | null>(null);
  const [pendingCycleDeselect, setPendingCycleDeselect] = useState<string | null>(null);

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
      const { data } = await api.get<AnneeScolaire | null>(ETABLISSEMENT_API.anneeActive);
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

  const cyclesSelectionnesOrdered = useMemo(
    () => cyclesSorted.map((c) => c.valeur).filter((v) => cyclesSelectionnes.has(v)),
    [cyclesSorted, cyclesSelectionnes],
  );

  const classesParCycleQueries = useMemo(
    () =>
      cyclesSelectionnesOrdered.map((cycle) => ({
        cycle,
        queryKey: ["valeurs-classes", cycle] as const,
      })),
    [cyclesSelectionnesOrdered],
  );

  const classesQueries = useQuery({
    queryKey: ["valeurs-classes-wizard", cyclesSelectionnesOrdered.join(",")],
    queryFn: async () => {
      const entries: Record<string, ValeurSysteme[]> = {};
      await Promise.all(
        cyclesSelectionnesOrdered.map(async (cycle) => {
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
    for (const cycle of cyclesSelectionnesOrdered) {
      for (const row of data[cycle] ?? []) {
        const key = classeKey(cycle, row.valeur);
        if (classesSelectionnees.has(key)) {
          list.push({ cycle, classe: row.valeur, key });
        }
      }
    }
    return list;
  }, [classesQueries.data, cyclesSelectionnesOrdered, classesSelectionnees]);

  const selectedClassesByCycle = useMemo(() => {
    const byCycle = new Map<string, { cycle: string; classe: string; key: string }[]>();
    for (const item of selectedClassesList) {
      const list = byCycle.get(item.cycle) ?? [];
      list.push(item);
      byCycle.set(item.cycle, list);
    }
    return cyclesSelectionnesOrdered
      .map((cycle) => ({
        cycle,
        classes: byCycle.get(cycle) ?? [],
      }))
      .filter((group) => group.classes.length > 0);
  }, [selectedClassesList, cyclesSelectionnesOrdered]);

  const getCycleClassKeys = (cycle: string): string[] =>
    (classesQueries.data?.[cycle] ?? []).map((classe) =>
      classeKey(cycle, classe.valeur),
    );

  const isCycleFullySelected = (cycle: string): boolean => {
    const keys = getCycleClassKeys(cycle);
    return keys.length > 0 && keys.every((key) => classesSelectionnees.has(key));
  };

  const wizardMutation = useMutation({
    mutationFn: async (payload: WizardEtablissementData) => {
      const { data } = await api.post<WizardEtablissementResponse>(
        ETABLISSEMENT_API.wizard,
        payload,
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

  const clearCycleConfiguration = (cycle: string): void => {
    const prefix = `${cycle}::`;
    setCyclesSelectionnes((prev) => {
      const next = new Set(prev);
      next.delete(cycle);
      return next;
    });
    setClassesSelectionnees((prev) => {
      const next = new Set(prev);
      for (const key of prev) {
        if (key.startsWith(prefix)) next.delete(key);
      }
      return next;
    });
    setSalles((prev) => {
      const next = { ...prev };
      for (const key of Object.keys(next)) {
        if (key.startsWith(prefix)) delete next[key];
      }
      return next;
    });
  };

  const cycleHasConfiguration = (cycle: string): boolean => {
    const prefix = `${cycle}::`;
    if ([...classesSelectionnees].some((key) => key.startsWith(prefix))) return true;
    return Object.keys(salles).some((key) => key.startsWith(prefix));
  };

  const toggleCycle = (cycle: string, checked: boolean): void => {
    if (checked) {
      setCyclesSelectionnes((prev) => new Set(prev).add(cycle));
      return;
    }
    clearCycleConfiguration(cycle);
  };

  const requestToggleCycle = (cycle: string, checked: boolean): void => {
    if (checked) {
      toggleCycle(cycle, true);
      return;
    }
    if (cycleHasConfiguration(cycle)) {
      setPendingCycleDeselect(cycle);
      return;
    }
    toggleCycle(cycle, false);
  };

  const prepareSallesForStep4 = (): void => {
    setSalles((prev) => {
      const next = cloneSallesRecord(prev);
      for (const { key } of selectedClassesList) {
        if ((next[key]?.length ?? 0) === 0) {
          next[key] = [createSalleDraft()];
        }
      }
      return next;
    });
  };

  const ensureSalleDrafts = (keys: string[]): void => {
    if (keys.length === 0) return;
    setSalles((prev) => {
      const next = cloneSallesRecord(prev);
      for (const key of keys) {
        if ((next[key]?.length ?? 0) === 0) {
          next[key] = [createSalleDraft()];
        }
      }
      return next;
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
    if (step === 3) {
      prepareSallesForStep4();
    }
    if (step < 4) setStep((step + 1) as StepIndex);
  };

  const goPrev = (): void => {
    setStepError(null);
    if (step > 0) setStep((step - 1) as StepIndex);
  };

  const handleFinish = (): void => {
    const err = validateStep(4);
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
      cycles_selectionnes: cyclesSelectionnesOrdered,
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
      matieres: [],
    };

    wizardMutation.mutate(payload);
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
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Les étapes suivantes (classes, salles) s&apos;adaptent automatiquement aux
                cycles que vous sélectionnez.
              </p>
              <div className="space-y-3">
                {cyclesSorted.map((cycle) => {
                  const Icon = CYCLE_ICONS[cycle.valeur] ?? BookOpen;
                  const checked = cyclesSelectionnes.has(cycle.valeur);
                  const notation = parseCycleNotationFromValeur(cycle.metadata_json);
                  return (
                    <label
                      key={cycle.id}
                      className="flex cursor-pointer items-start gap-3 rounded-lg border border-border p-4 hover:bg-muted/40"
                    >
                      <Checkbox
                        className="mt-0.5"
                        checked={checked}
                        onCheckedChange={(c) => requestToggleCycle(cycle.valeur, c)}
                      />
                      <Icon className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                      <div>
                        <span className="font-medium">{displayCycleLabel(cycle.valeur)}</span>
                        <p className="text-sm text-muted-foreground">
                          {notation.type_evaluation === "qualitative"
                            ? "Évaluation qualitative"
                            : "Évaluation chiffrée"}
                        </p>
                      </div>
                    </label>
                  );
                })}
              </div>
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
                  {cyclesSelectionnesOrdered.map((cycle) => {
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
            <div className="space-y-8">
              {selectedClassesByCycle.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Sélectionnez des classes à l&apos;étape précédente.
                </p>
              ) : (
                selectedClassesByCycle.map(({ cycle, classes }) => (
                  <section key={cycle}>
                    <h3 className="mb-4 font-semibold">{displayCycleLabel(cycle)}</h3>
                    <div className="space-y-6">
                      {classes.map(({ key, classe }) => (
                        <div key={key} className="rounded-lg border border-border p-4">
                          <h4 className="mb-3 font-medium">{classe}</h4>
                          <div className="space-y-2">
                            {(salles[key] ?? []).map((salle) => (
                              <div
                                key={salle.localId}
                                className="flex flex-wrap items-end gap-2"
                              >
                                <div className="min-w-[140px] flex-1 space-y-1">
                                  <Label>Nom salle</Label>
                                  <Input
                                    key={`${key}-${salle.localId}-nom`}
                                    value={salle.nom_salle}
                                    placeholder="Salle A"
                                    onChange={(e) =>
                                      setSalles((prev) =>
                                        updateSalleField(
                                          prev,
                                          key,
                                          salle.localId,
                                          { nom_salle: e.target.value },
                                        ),
                                      )
                                    }
                                  />
                                </div>
                                <div className="w-28 space-y-1">
                                  <Label>Capacité</Label>
                                  <Input
                                    key={`${key}-${salle.localId}-capacite`}
                                    type="text"
                                    inputMode="numeric"
                                    pattern="[0-9]*"
                                    value={salle.capacite}
                                    onChange={(e) =>
                                      setSalles((prev) =>
                                        updateSalleField(
                                          prev,
                                          key,
                                          salle.localId,
                                          { capacite: e.target.value },
                                        ),
                                      )
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
                                [key]: [...(prev[key] ?? []), createSalleDraft()],
                              }))
                            }
                          >
                            <Plus className="mr-1 h-4 w-4" />
                            Ajouter une salle
                          </Button>
                        </div>
                      ))}
                    </div>
                  </section>
                ))
              )}
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
        {step < 4 ? (
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

      <Dialog
        open={Boolean(pendingCycleDeselect)}
        onClose={() => setPendingCycleDeselect(null)}
      >
        <h2 className="mb-2 text-lg font-semibold">Désélectionner ce cycle ?</h2>
        <p className="mb-4 text-sm text-muted-foreground">
          Désélectionner ce cycle supprimera sa configuration en cours. Continuer ?
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setPendingCycleDeselect(null)}>
            Annuler
          </Button>
          <Button
            variant="destructive"
            onClick={() => {
              if (pendingCycleDeselect) {
                toggleCycle(pendingCycleDeselect, false);
                setPendingCycleDeselect(null);
              }
            }}
          >
            Continuer
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
