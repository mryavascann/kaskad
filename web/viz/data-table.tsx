import type { ReactNode } from "react";
import { Disclosure } from "@/design/ui/disclosure";
import { cn } from "@/lib/utils";

export type TableColumn<Row> = {
  label: string;
  /** Numbers align to the end. */
  numeric?: boolean;
  cell: (row: Row) => ReactNode;
};

type DataTableProps<Row> = {
  /** The disclosure line, e.g. "Data table". */
  summary: string;
  /** The table's caption (screen readers) and the scroll region's name. */
  caption: string;
  columns: readonly TableColumn<Row>[];
  rows: readonly Row[];
  rowKey: (row: Row, index: number) => string | number;
  className?: string;
};

/**
 * The chart's numbers as a table, folded in a native `<details>`: every value the chart draws, for
 * screen readers, keyboard users and anyone who wants the exact figure. Scrolls inside its own box.
 */
export function DataTable<Row>({ summary, caption, columns, rows, rowKey, className }: DataTableProps<Row>) {
  return (
    <Disclosure mono summary={summary} className={className} data-slot="data-table">
      <div role="region" aria-label={caption} tabIndex={0} className="max-h-80 overflow-auto rounded-control border border-line">
        <table className="w-full border-collapse font-mono text-caption tabular-nums">
          <caption className="sr-only">{caption}</caption>
          <thead className="sticky top-0 z-(--z-raised) bg-elev-2">
            <tr>
              {columns.map((c) => (
                <th
                  key={c.label}
                  scope="col"
                  className={cn("label-mono px-3 py-2 font-normal whitespace-nowrap text-fg-3", c.numeric ? "text-right" : "text-left")}
                >
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((row, i) => (
              <tr key={rowKey(row, i)}>
                {columns.map((c) => (
                  <td key={c.label} className={cn("px-3 py-1.5 whitespace-nowrap text-fg-2", c.numeric ? "text-right" : "text-left")}>
                    {c.cell(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Disclosure>
  );
}
