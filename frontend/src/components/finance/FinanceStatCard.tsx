import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type StatColor = "green" | "red" | "blue" | "amber";

const COLOR_CLASSES: Record<StatColor, string> = {
  green: "border-emerald-200 bg-emerald-50",
  red: "border-red-200 bg-red-50",
  blue: "border-blue-200 bg-blue-50",
  amber: "border-amber-200 bg-amber-50",
};

interface FinanceStatCardProps {
  label: string;
  value: string;
  color?: StatColor;
  trend?: string;
}

export function FinanceStatCard({
  label,
  value,
  color = "blue",
  trend,
}: FinanceStatCardProps): React.JSX.Element {
  return (
    <Card className={cn("border", COLOR_CLASSES[color])}>
      <CardContent className="p-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-2xl font-bold">{value}</p>
        {trend ? <p className="mt-1 text-xs text-muted-foreground">{trend}</p> : null}
      </CardContent>
    </Card>
  );
}
