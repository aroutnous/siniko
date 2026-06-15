import { Trash2 } from "lucide-react";
import { useState } from "react";

import { ExportButton } from "@/components/reporting/ExportButton";
import { useSallesSelectData } from "@/hooks/useSallesSelectData";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { ETABLISSEMENT_API } from "@/lib/etablissement-api";
import { getSalleDisplayName } from "@/lib/etablissement-utils";
import { REPORTING_API } from "@/lib/reporting-api";
import { useExportHistoryStore } from "@/stores/exportHistoryStore";
import type { AnneeScolaire, Periode, Salle } from "@/types";

export function ExportsPage(): React.JSX.Element {
  const { items, clear } = useExportHistoryStore();
  const [anneeId, setAnneeId] = useState("");
  const [classeId, setClasseId] = useState("");
  const [periodeId, setPeriodeId] = useState("");

  const { data: annees = [] } = useQuery({
    queryKey: ["annees-scolaires"],
    queryFn: async () => {
      const { data } = await api.get<AnneeScolaire[]>(ETABLISSEMENT_API.annees);
      return data;
    },
  });

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

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Rapport financier</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Année scolaire</Label>
            <Select
              value={anneeId}
              onChange={(e) => setAnneeId(e.target.value)}
              className="max-w-[260px]"
            >
              <option value="">Sélectionner</option>
              {annees.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.libelle}
                </option>
              ))}
            </Select>
          </div>
          {anneeId ? (
            <ExportButton
              label="Rapport financier"
              url={REPORTING_API.exportRapportFinancier}
              params={{ annee_id: anneeId }}
              pdfFilename="rapport-financier.pdf"
              excelFilename="rapport-financier.xlsx"
            />
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Résultats de classe</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-4">
            <div className="space-y-2">
              <Label>Classe</Label>
              <Select
                value={classeId}
                onChange={(e) => setClasseId(e.target.value)}
                className="max-w-[200px]"
              >
                <option value="">Sélectionner</option>
                {sortedSalles.map((s) => (
                  <option key={s.id} value={s.id}>
                    {getSalleDisplayName(s, classesMap.get(s.classe_id) ?? null)}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Période</Label>
              <Select
                value={periodeId}
                onChange={(e) => setPeriodeId(e.target.value)}
                className="max-w-[200px]"
                disabled={!classeId}
              >
                <option value="">Sélectionner</option>
                {periodes.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nom}
                  </option>
                ))}
              </Select>
            </div>
          </div>
          {classeId && periodeId ? (
            <ExportButton
              label="Résultats classe"
              url={REPORTING_API.exportResultatsClasse}
              params={{ classe_id: classeId, periode_id: periodeId }}
              pdfFilename="resultats-classe.pdf"
              excelFilename="resultats-classe.xlsx"
              defaultFormat="excel"
            />
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Historique des exports</CardTitle>
          {items.length > 0 ? (
            <Button variant="ghost" size="sm" onClick={clear}>
              <Trash2 className="mr-2 h-4 w-4" />
              Effacer
            </Button>
          ) : null}
        </CardHeader>
        <CardContent>
          {items.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Les téléchargements récents apparaîtront ici.
            </p>
          ) : (
            <ul className="space-y-2 text-sm">
              {items.map((item) => (
                <li
                  key={item.id}
                  className="flex items-center justify-between border-b border-border py-2 last:border-0"
                >
                  <span>{item.label}</span>
                  <span className="text-muted-foreground">
                    {item.format.toUpperCase()} —{" "}
                    {new Date(item.downloadedAt).toLocaleString("fr-FR")}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
