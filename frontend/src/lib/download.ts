import { api } from "@/lib/api";

export async function downloadPdf(url: string, filename: string): Promise<void> {
  const { data } = await api.get<Blob>(url, { responseType: "blob" });
  const blob = new Blob([data], { type: "application/pdf" });
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(objectUrl);
}
