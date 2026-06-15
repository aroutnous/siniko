import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { FormModal } from "@/components/etablissement/FormModal";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { useClassesSelectData } from "@/hooks/useClassesSelectData";
import { api, getErrorMessage } from "@/lib/api";
import { ENSEIGNANTS_API } from "@/lib/enseignants-api";
import { ETABLISSEMENT_API } from "@/lib/etablissement-api";
import { getClasseAbbreviation } from "@/lib/etablissement-utils";
import { useToastStore } from "@/stores/toastStore";
import type { AnneeScolaire, Matiere } from "@/types";

export type AffectationMode = "matiere" | "classe";

interface AffectationModalProps {
  open: boolean;
  mode: AffectationMode;
  enseignantId: string;
  enseignantLabel: string;
  onClose: () => void;
}

export function AffectationModal({
  open,
  mode,
  enseignantId,
  enseignantLabel,
  onClose,
}: AffectationModalProps): React.JSX.Element {
  const queryClient = useQueryClient();
  const toast = useToastStore((s) => s.show);
  const [matiereId, setMatiereId] = useState("");
  const [classeId, setClasseId] = useState("");
  const [anneeId, setAnneeId] = useState("");

  useEffect(() => {
    if (!open) {
      setMatiereId("");
      setClasseId("");
      setAnneeId("");
    }
  }, [open]);

  const { data: matieres = [] } = useQuery({
    queryKey: ["matieres"],
    queryFn: async () => {
      const { data } = await api.get<Matiere[]>(ETABLISSEMENT_API.matieres);
      return data;
    },
    enabled: open && mode === "matiere",
  });

  const { sortedClasses } = useClassesSelectData({ enabled: open });

  const { data: annees = [] } = useQuery({
    queryKey: ["annees-scolaires"],
    queryFn: async () => {
      const { data } = await api.get<AnneeScolaire[]>(ETABLISSEMENT_API.annees);
      return data;
    },
    enabled: open && mode === "classe",
  });

  const matiereMutation = useMutation({
    mutationFn: async () => {
      const body: { matiere_id: string; classe_id?: string } = {
        matiere_id: matiereId,
      };
      if (classeId) body.classe_id = classeId;
      const { data } = await api.post(ENSEIGNANTS_API.matieres(enseignantId), body);
      return data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["enseignants"] });
      toast("Matière affectée");
      onClose();
    },
    onError: (err) => toast(getErrorMessage(err), "error"),
  });

  const classeMutation = useMutation({
    mutationFn: async () => {
      const { data } = await api.post(ENSEIGNANTS_API.classes(enseignantId), {
        classe_id: classeId,
        annee_scolaire_id: anneeId,
      });
      return data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["enseignants"] });
      toast("Classe affectée");
      onClose();
    },
    onError: (err) => toast(getErrorMessage(err), "error"),
  });

  const loading = matiereMutation.isPending || classeMutation.isPending;
  const title =
    mode === "matiere"
      ? `Affecter une matière — ${enseignantLabel}`
      : `Affecter une classe — ${enseignantLabel}`;

  const canSubmit =
    mode === "matiere"
      ? Boolean(matiereId)
      : Boolean(classeId && anneeId);

  return (
    <FormModal
      open={open}
      title={title}
      onClose={onClose}
      onSubmit={() => {
        if (mode === "matiere") matiereMutation.mutate();
        else classeMutation.mutate();
      }}
      loading={loading}
      submitLabel="Affecter"
    >
      {mode === "matiere" ? (
        <>
          <div className="space-y-2">
            <Label htmlFor="affect-matiere">Matière *</Label>
            <Select
              id="affect-matiere"
              value={matiereId}
              onChange={(e) => setMatiereId(e.target.value)}
              required
            >
              <option value="">Sélectionner</option>
              {matieres.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.nom}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="affect-classe-opt">Classe (optionnel)</Label>
            <Select
              id="affect-classe-opt"
              value={classeId}
              onChange={(e) => setClasseId(e.target.value)}
            >
              <option value="">Toutes les classes</option>
              {sortedClasses.map((c) => (
                <option key={c.id} value={c.id}>
                  {getClasseAbbreviation(c.nom)}
                </option>
              ))}
            </Select>
          </div>
        </>
      ) : (
        <>
          <div className="space-y-2">
            <Label htmlFor="affect-classe">Classe *</Label>
            <Select
              id="affect-classe"
              value={classeId}
              onChange={(e) => setClasseId(e.target.value)}
              required
            >
              <option value="">Sélectionner</option>
              {sortedClasses.map((c) => (
                <option key={c.id} value={c.id}>
                  {getClasseAbbreviation(c.nom)}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="affect-annee">Année scolaire *</Label>
            <Select
              id="affect-annee"
              value={anneeId}
              onChange={(e) => setAnneeId(e.target.value)}
              required
            >
              <option value="">Sélectionner</option>
              {annees.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.libelle}
                </option>
              ))}
            </Select>
          </div>
        </>
      )}
      {!canSubmit ? (
        <p className="text-xs text-muted-foreground">Remplissez les champs obligatoires.</p>
      ) : null}
    </FormModal>
  );
}
