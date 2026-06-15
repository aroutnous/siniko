import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import { api } from "@/lib/api";
import { ETABLISSEMENT_API } from "@/lib/etablissement-api";
import {
  buildClassesNiveauMap,
  buildCyclesMap,
  sortSallesForSelect,
} from "@/lib/etablissement-utils";
import type { ClasseNiveau, Cycle, Salle } from "@/types";

export function useSallesSelectData(salles: Salle[]): {
  sortedSalles: Salle[];
  classesMap: Map<string, ClasseNiveau>;
  cyclesMap: Map<string, Cycle>;
} {
  const { data: classesNiveau = [] } = useQuery({
    queryKey: ["classes-niveau"],
    queryFn: async () => {
      const { data } = await api.get<ClasseNiveau[]>(ETABLISSEMENT_API.classesNiveau);
      return data;
    },
  });

  const { data: cycles = [] } = useQuery({
    queryKey: ["cycles"],
    queryFn: async () => {
      const { data } = await api.get<Cycle[]>(ETABLISSEMENT_API.cycles);
      return data;
    },
  });

  const classesMap = useMemo(
    () => buildClassesNiveauMap(classesNiveau),
    [classesNiveau],
  );
  const cyclesMap = useMemo(() => buildCyclesMap(cycles), [cycles]);
  const sortedSalles = useMemo(
    () => sortSallesForSelect(salles, classesMap, cyclesMap),
    [salles, classesMap, cyclesMap],
  );

  return { sortedSalles, classesMap, cyclesMap };
}
