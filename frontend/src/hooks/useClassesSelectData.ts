import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import { api } from "@/lib/api";
import { ETABLISSEMENT_API } from "@/lib/etablissement-api";
import {
  buildClassesNiveauMap,
  buildCyclesMap,
  sortClassesForSelect,
} from "@/lib/etablissement-utils";
import type { ClasseNiveau, Cycle } from "@/types";

export function useClassesSelectData(options?: { enabled?: boolean }): {
  sortedClasses: ClasseNiveau[];
  classesMap: Map<string, ClasseNiveau>;
  cyclesMap: Map<string, Cycle>;
} {
  const enabled = options?.enabled ?? true;

  const { data: classesNiveau = [] } = useQuery({
    queryKey: ["classes-niveau"],
    queryFn: async () => {
      const { data } = await api.get<ClasseNiveau[]>(ETABLISSEMENT_API.classesNiveau);
      return data;
    },
    enabled,
  });

  const { data: cycles = [] } = useQuery({
    queryKey: ["cycles"],
    queryFn: async () => {
      const { data } = await api.get<Cycle[]>(ETABLISSEMENT_API.cycles);
      return data;
    },
    enabled,
  });

  const classesMap = useMemo(
    () => buildClassesNiveauMap(classesNiveau),
    [classesNiveau],
  );
  const cyclesMap = useMemo(() => buildCyclesMap(cycles), [cycles]);
  const sortedClasses = useMemo(
    () => sortClassesForSelect(classesNiveau, cyclesMap),
    [classesNiveau, cyclesMap],
  );

  return { sortedClasses, classesMap, cyclesMap };
}
