import { Search } from "lucide-react";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import type { Eleve, FraisScolaire, ModePaiement } from "@/types";

export interface PaiementFormValues {
  eleve_id: string;
  frais_id: string;
  montant_paye: string;
  mode_paiement: ModePaiement;
}

interface PaiementFormProps {
  values: PaiementFormValues;
  onChange: (field: keyof PaiementFormValues, value: string) => void;
  eleves: Eleve[];
  frais: FraisScolaire[];
  disabled?: boolean;
}

const MODES: { value: ModePaiement; label: string }[] = [
  { value: "especes", label: "Espèces" },
  { value: "mobile_money", label: "Mobile Money" },
  { value: "virement", label: "Virement" },
  { value: "cheque", label: "Chèque" },
];

export function PaiementForm({
  values,
  onChange,
  eleves,
  frais,
  disabled = false,
}: PaiementFormProps): React.JSX.Element {
  const [search, setSearch] = useState("");

  const filteredEleves = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return eleves.slice(0, 20);
    return eleves
      .filter(
        (e) =>
          e.nom.toLowerCase().includes(term) ||
          e.prenom.toLowerCase().includes(term) ||
          e.matricule.toLowerCase().includes(term),
      )
      .slice(0, 20);
  }, [eleves, search]);

  const selectedFrais = frais.find((f) => f.id === values.frais_id);

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="space-y-2 sm:col-span-2">
        <Label htmlFor="eleve_search">Rechercher un élève *</Label>
        <div className="flex gap-2">
          <Input
            id="eleve_search"
            placeholder="Nom, prénom ou matricule…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            disabled={disabled}
          />
          <Button type="button" variant="outline" size="sm" disabled={disabled}>
            <Search className="h-4 w-4" />
          </Button>
        </div>
        <Select
          value={values.eleve_id}
          onChange={(e) => onChange("eleve_id", e.target.value)}
          required
          disabled={disabled}
        >
          <option value="">Sélectionner un élève</option>
          {filteredEleves.map((e) => (
            <option key={e.id} value={e.id}>
              {e.matricule} — {e.nom} {e.prenom}
            </option>
          ))}
        </Select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="frais_id">Frais *</Label>
        <Select
          id="frais_id"
          value={values.frais_id}
          onChange={(e) => {
            onChange("frais_id", e.target.value);
            const f = frais.find((x) => x.id === e.target.value);
            if (f) onChange("montant_paye", String(f.montant));
          }}
          required
          disabled={disabled}
        >
          <option value="">Sélectionner</option>
          {frais.map((f) => (
            <option key={f.id} value={f.id}>
              {f.libelle} — {Number(f.montant).toLocaleString("fr-FR")} FCFA
            </option>
          ))}
        </Select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="montant_paye">Montant (FCFA) *</Label>
        <Input
          id="montant_paye"
          type="number"
          min="1"
          value={values.montant_paye}
          onChange={(e) => onChange("montant_paye", e.target.value)}
          required
          disabled={disabled}
        />
        {selectedFrais ? (
          <p className="text-xs text-muted-foreground">
            Montant du frais : {Number(selectedFrais.montant).toLocaleString("fr-FR")} FCFA
          </p>
        ) : null}
      </div>
      <div className="space-y-2 sm:col-span-2">
        <Label htmlFor="mode_paiement">Mode de paiement *</Label>
        <Select
          id="mode_paiement"
          value={values.mode_paiement}
          onChange={(e) => onChange("mode_paiement", e.target.value)}
          disabled={disabled}
        >
          {MODES.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </Select>
      </div>
    </div>
  );
}
