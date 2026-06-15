import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { FormModal } from "@/components/etablissement/FormModal";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { useSallesSelectData } from "@/hooks/useSallesSelectData";
import { api, getErrorMessage } from "@/lib/api";
import { ETABLISSEMENT_API } from "@/lib/etablissement-api";
import { getSalleDisplayName } from "@/lib/etablissement-utils";
import { ELEVES_API } from "@/lib/eleves-api";
import { useToastStore } from "@/stores/toastStore";
import type { AnneeScolaire, Classe, Inscription } from "@/types";
import { useState } from "react";

interface TransfertModalProps {
  open: boolean;
  onClose: () => void;
  eleveId: string;
  currentClasseId?: string;
  title?: string;
  submitLabel?: string;
}

export function TransfertModal({
  open,
  onClose,
  eleveId,
  currentClasseId,
  title = "Transférer l'élève",
  submitLabel = "Transférer",
}: TransfertModalProps): React.JSX.Element {
  const queryClient = useQueryClient();
  const toast = useToastStore((s) => s.show);
  const [classeId, setClasseId] = useState("");

  const { data: salles = [] } = useQuery({
    queryKey: ["salles"],
    queryFn: async () => {
      const { data } = await api.get<Classe[]>(ETABLISSEMENT_API.salles);
      return data;
    },
    enabled: open,
  });

  const { sortedSalles, classesMap } = useSallesSelectData(salles);

  const { data: anneeActive } = useQuery({
    queryKey: ["annee-active"],
    queryFn: async () => {
      const { data } = await api.get<AnneeScolaire>(ETABLISSEMENT_API.anneeActive);
      return data;
    },
    enabled: open,
  });

  const mutation = useMutation({
    mutationFn: async () => {
      const { data } = await api.post<Inscription>(ELEVES_API.transferer(eleveId), {
        classe_id: classeId,
        annee_scolaire_id: anneeActive?.id,
      });
      return data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["eleve-dossier", eleveId] });
      void queryClient.invalidateQueries({ queryKey: ["eleves"] });
      toast("Élève transféré avec succès");
      setClasseId("");
      onClose();
    },
    onError: (err) => toast(getErrorMessage(err), "error"),
  });

  const availableSalles = sortedSalles.filter((s) => s.id !== currentClasseId);

  return (
    <FormModal
      open={open}
      title={title}
      onClose={() => {
        setClasseId("");
        onClose();
      }}
      onSubmit={() => mutation.mutate()}
      loading={mutation.isPending}
      submitLabel={submitLabel}
    >
      <div className="space-y-2">
        <Label htmlFor="nouvelle_classe">Salle *</Label>
        <Select
          id="nouvelle_classe"
          value={classeId}
          onChange={(e) => setClasseId(e.target.value)}
          required
        >
          <option value="">Sélectionner une salle</option>
          {availableSalles.map((s) => (
            <option key={s.id} value={s.id}>
              {getSalleDisplayName(s, classesMap.get(s.classe_id) ?? null)}
            </option>
          ))}
        </Select>
      </div>
      {anneeActive ? (
        <p className="text-sm text-muted-foreground">
          Année scolaire : <strong>{anneeActive.libelle}</strong>
        </p>
      ) : null}
    </FormModal>
  );
}
