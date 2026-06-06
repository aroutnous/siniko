import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export interface FinanceChartDatum {
  mois: string;
  recettes: number;
  depenses: number;
}

interface FinanceChartProps {
  data: FinanceChartDatum[];
}

export function FinanceChart({ data }: FinanceChartProps): React.JSX.Element {
  if (data.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        Aucune donnée pour le graphique
      </p>
    );
  }

  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
          <XAxis dataKey="mois" tick={{ fontSize: 12 }} />
          <YAxis tick={{ fontSize: 12 }} />
          <Tooltip
            formatter={(value) => {
              const num = typeof value === "number" ? value : Number(value);
              return `${num.toLocaleString("fr-FR")} FCFA`;
            }}
          />
          <Legend />
          <Line
            type="monotone"
            dataKey="recettes"
            name="Recettes"
            stroke="#16a34a"
            strokeWidth={2}
            dot={{ r: 3 }}
          />
          <Line
            type="monotone"
            dataKey="depenses"
            name="Dépenses"
            stroke="#dc2626"
            strokeWidth={2}
            dot={{ r: 3 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
