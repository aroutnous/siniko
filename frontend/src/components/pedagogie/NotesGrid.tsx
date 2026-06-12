import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { STATUT_COMPETENCE_OPTIONS } from "@/lib/pedagogie-utils";
import type { Eleve, Matiere, TypeEvaluation } from "@/types";

export interface NoteCellValue {
  valeur: string;
  valeur_qualitative: string;
  appreciation: string;
  noteId?: string;
}

export type NotesGridState = Record<string, NoteCellValue>;

export function cellKey(eleveId: string, matiereId: string): string {
  return `${eleveId}:${matiereId}`;
}

interface NotesGridProps {
  eleves: Eleve[];
  matieres: Matiere[];
  values: NotesGridState;
  typeEvaluation: TypeEvaluation;
  noteMax: number;
  notePassage: number;
  readOnly?: boolean;
  onChange: (key: string, field: keyof NoteCellValue, value: string) => void;
}

export function NotesGrid({
  eleves,
  matieres,
  values,
  typeEvaluation,
  noteMax,
  notePassage,
  readOnly = false,
  onChange,
}: NotesGridProps): React.JSX.Element {
  if (eleves.length === 0 || matieres.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Sélectionnez une classe avec des élèves et des matières configurées.
      </p>
    );
  }

  const isQualitative = typeEvaluation === "qualitative";

  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead className="border-b border-border bg-muted/50">
          <tr>
            <th className="sticky left-0 z-10 bg-muted/50 px-3 py-2 font-medium">
              Élève
            </th>
            {matieres.map((m) => (
              <th key={m.id} colSpan={2} className="border-l border-border px-2 py-2 text-center">
                {m.nom}
              </th>
            ))}
          </tr>
          <tr className="border-b border-border bg-muted/30 text-xs text-muted-foreground">
            <th className="sticky left-0 z-10 bg-muted/30 px-3 py-1" />
            {matieres.map((m) => (
              <th key={`${m.id}-sub`} colSpan={2} className="border-l border-border">
                <div className="grid grid-cols-2">
                  <span className="px-2 py-1 text-center">
                    {isQualitative ? "Statut" : "Note"}
                  </span>
                  <span className="px-2 py-1 text-center">Appréciation</span>
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {eleves.map((eleve) => (
            <tr key={eleve.id} className="border-b border-border last:border-0">
              <td className="sticky left-0 z-10 bg-background px-3 py-2 font-medium whitespace-nowrap">
                {eleve.nom} {eleve.prenom}
              </td>
              {matieres.map((matiere) => {
                const key = cellKey(eleve.id, matiere.id);
                const cell = values[key] ?? {
                  valeur: "",
                  valeur_qualitative: "",
                  appreciation: "",
                };
                const num = cell.valeur !== "" ? Number(cell.valeur) : null;
                const belowPassage =
                  !isQualitative &&
                  num !== null &&
                  !Number.isNaN(num) &&
                  num < notePassage;

                return (
                  <td key={matiere.id} colSpan={2} className="border-l border-border p-1">
                    <div className="grid grid-cols-2 gap-1">
                      {isQualitative ? (
                        <Select
                          value={cell.valeur_qualitative}
                          disabled={readOnly}
                          onChange={(e) =>
                            onChange(key, "valeur_qualitative", e.target.value)
                          }
                          className="h-8"
                        >
                          <option value="">—</option>
                          {STATUT_COMPETENCE_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                        </Select>
                      ) : (
                        <Input
                          type="number"
                          min={0}
                          max={noteMax}
                          step={0.25}
                          value={cell.valeur}
                          disabled={readOnly}
                          onChange={(e) => onChange(key, "valeur", e.target.value)}
                          className={`h-8 text-center ${belowPassage ? "border-red-500 text-red-600" : ""}`}
                        />
                      )}
                      <Input
                        value={cell.appreciation}
                        disabled={readOnly}
                        onChange={(e) => onChange(key, "appreciation", e.target.value)}
                        className="h-8"
                        placeholder="Appréciation"
                      />
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
