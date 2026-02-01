export function toCsv(rows: Record<string, any>[], columns?: string[]) {
  const cols = columns ?? inferColumns(rows);

  const esc = (v: any) => {
    if (v === null || v === undefined) return "";
    const s = String(v);
    if (/[\n\r,\"]/g.test(s)) return `"${s.replace(/\"/g, '""')}"`;
    return s;
  };

  const header = cols.map(esc).join(",");
  const body = rows.map((r) => cols.map((c) => esc(r[c])).join(",")).join("\n");
  return `${header}\n${body}\n`;
}

export function downloadTextFile(filename: string, contents: string) {
  const blob = new Blob([contents], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function inferColumns(rows: Record<string, any>[]) {
  const set = new Set<string>();
  for (const r of rows) Object.keys(r).forEach((k) => set.add(k));
  return Array.from(set);
}
