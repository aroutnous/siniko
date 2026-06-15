import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { getSalleDisplayName } from "@/lib/etablissement-utils";
import type { ClasseNiveau, Eleve, Salle, TypeAbsence } from "@/types";

export interface AbsenceFormValues {
  eleve_id: string;
  classe_id: string;
  date_absence: string;
  type: TypeAbsence | "";
  motif: string;
}

interface AbsenceFormProps {
  values: AbsenceFormValues;
  onChange: (field: keyof AbsenceFormValues, value: string) => void;
  eleves: Eleve[];
  salles: Salle[];
  classesMap: Map<string, ClasseNiveau>;
  showEleveSelect?: boolean;
}

export function AbsenceForm({
  values,
  onChange,
  eleves,
  salles,
  classesMap,
  showEleveSelect = true,
}: AbsenceFormProps): React.JSX.Element {
  return (
    <div className="space-y-4">
      {showEleveSelect ? (
        <div className="space-y-2">
          <Label htmlFor="eleve_id">Élève *</Label>
          <Select
            id="eleve_id"
            value={values.eleve_id}
            onChange={(e) => onChange("eleve_id", e.target.value)}
            required
          >
            <option value="">Sélectionner un élève</option>
            {eleves.map((e) => (
              <option key={e.id} value={e.id}>
                {e.matricule} — {e.nom} {e.prenom}
              </option>
            ))}
          </Select>
        </div>
      ) : null}
      <div className="space-y-2">
        <Label htmlFor="classe_id">Classe *</Label>
        <Select
          id="classe_id"
          value={values.classe_id}
          onChange={(e) => onChange("classe_id", e.target.value)}
          required
        >
          <option value="">Sélectionner une classe</option>
          {salles.map((s) => (
            <option key={s.id} value={s.id}>
              {getSalleDisplayName(s, classesMap.get(s.classe_id) ?? null)}
            </option>
          ))}
        </Select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="date_absence">Date *</Label>
        <Input
          id="date_absence"
          type="date"
          value={values.date_absence}
          onChange={(e) => onChange("date_absence", e.target.value)}
          required
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="type">Type *</Label>
        <Select
          id="type"
          value={values.type}
          onChange={(e) => onChange("type", e.target.value)}
          required
        >
          <option value="">Sélectionner</option>
          <option value="absence">Absence</option>
          <option value="retard">Retard</option>
        </Select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="motif">Motif</Label>
        <Input
          id="motif"
          value={values.motif}
          onChange={(e) => onChange("motif", e.target.value)}
          placeholder="Optionnel"
        />
      </div>
    </div>
  );
}
