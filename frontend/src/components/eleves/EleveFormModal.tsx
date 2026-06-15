import { FormModal } from "@/components/etablissement/FormModal";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import type { Eleve } from "@/types";

export interface EleveFormValues {
  nom: string;
  prenom: string;
  date_naissance: string;
  lieu_naissance: string;
  sexe: "" | "M" | "F";
  photo_url: string;
  nom_parent: string;
  telephone_parent: string;
  adresse: string;
}

export function eleveToForm(eleve: Eleve): EleveFormValues {
  return {
    nom: eleve.nom,
    prenom: eleve.prenom,
    date_naissance: eleve.date_naissance ?? "",
    lieu_naissance: eleve.lieu_naissance ?? "",
    sexe: eleve.sexe ?? "",
    photo_url: eleve.photo_url ?? "",
    nom_parent: eleve.nom_parent ?? "",
    telephone_parent: eleve.telephone_parent ?? "",
    adresse: eleve.adresse ?? "",
  };
}

export function formToPayload(form: EleveFormValues): Record<string, string | undefined> {
  return {
    nom: form.nom,
    prenom: form.prenom,
    date_naissance: form.date_naissance || undefined,
    lieu_naissance: form.lieu_naissance || undefined,
    sexe: form.sexe || undefined,
    photo_url: form.photo_url || undefined,
    nom_parent: form.nom_parent || undefined,
    telephone_parent: form.telephone_parent || undefined,
    adresse: form.adresse || undefined,
  };
}

interface EleveFormModalProps {
  open: boolean;
  title: string;
  form: EleveFormValues;
  loading?: boolean;
  onClose: () => void;
  onSubmit: () => void;
  onChange: (form: EleveFormValues) => void;
}

export function EleveFormModal({
  open,
  title,
  form,
  loading = false,
  onClose,
  onSubmit,
  onChange,
}: EleveFormModalProps): React.JSX.Element {
  const set = (patch: Partial<EleveFormValues>): void => {
    onChange({ ...form, ...patch });
  };

  return (
    <FormModal
      open={open}
      title={title}
      onClose={onClose}
      onSubmit={onSubmit}
      loading={loading}
      submitLabel="Enregistrer"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="eleve_nom">Nom *</Label>
          <Input
            id="eleve_nom"
            value={form.nom}
            onChange={(e) => set({ nom: e.target.value })}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="eleve_prenom">Prénom *</Label>
          <Input
            id="eleve_prenom"
            value={form.prenom}
            onChange={(e) => set({ prenom: e.target.value })}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="eleve_date_naissance">Date de naissance</Label>
          <Input
            id="eleve_date_naissance"
            type="date"
            value={form.date_naissance}
            onChange={(e) => set({ date_naissance: e.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="eleve_lieu_naissance">Lieu de naissance</Label>
          <Input
            id="eleve_lieu_naissance"
            value={form.lieu_naissance}
            onChange={(e) => set({ lieu_naissance: e.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="eleve_sexe">Sexe</Label>
          <Select
            id="eleve_sexe"
            value={form.sexe}
            onChange={(e) => set({ sexe: e.target.value as "" | "M" | "F" })}
          >
            <option value="">Non renseigné</option>
            <option value="M">Masculin</option>
            <option value="F">Féminin</option>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="eleve_photo_url">URL photo</Label>
          <Input
            id="eleve_photo_url"
            value={form.photo_url}
            onChange={(e) => set({ photo_url: e.target.value })}
            placeholder="https://…"
          />
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="eleve_nom_parent">Nom du parent / tuteur</Label>
          <Input
            id="eleve_nom_parent"
            value={form.nom_parent}
            onChange={(e) => set({ nom_parent: e.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="eleve_telephone_parent">Téléphone parent</Label>
          <Input
            id="eleve_telephone_parent"
            value={form.telephone_parent}
            onChange={(e) => set({ telephone_parent: e.target.value })}
          />
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="eleve_adresse">Adresse</Label>
          <Input
            id="eleve_adresse"
            value={form.adresse}
            onChange={(e) => set({ adresse: e.target.value })}
          />
        </div>
      </div>
    </FormModal>
  );
}
