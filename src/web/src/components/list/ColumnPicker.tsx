import { Columns3 } from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import { Checkbox } from "@/components/ui/checkbox.tsx";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover.tsx";
import { type ColumnKey, listMessages } from "@/i18n/messages/list.tsx";
import { sameColumns, toggleColumn } from "@/lib/listTable.ts";
import { COLUMN_ORDER, COLUMNS, DEFAULT_COLUMNS } from "./columns.tsx";

/** Shows or hides number columns. The time and work columns always stay. */
export function ColumnPicker({
  keys,
  onChange,
}: {
  keys: ColumnKey[];
  /** Null resets to the default columns. */
  onChange: (keys: ColumnKey[] | null) => void;
}) {
  const m = listMessages();
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="xs" className="mt-2 shrink-0 text-muted-foreground">
          <Columns3 />
          {m.columnsButton}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-60 gap-0 p-0">
        <div className="flex h-10 items-center justify-between border-b px-3">
          <span className="font-medium text-muted-foreground text-xs">{m.columnsTitle}</span>
          {!sameColumns(keys, DEFAULT_COLUMNS) && (
            <Button variant="ghost" size="xs" onClick={() => onChange(null)}>
              {m.columnsReset}
            </Button>
          )}
        </div>
        <ul className="py-1">
          {COLUMNS.map((c) => (
            <ColumnOption
              key={c.key}
              columnKey={c.key}
              checked={keys.includes(c.key)}
              onCheckedChange={(on) => onChange(toggleColumn(COLUMN_ORDER, keys, c.key, on))}
            />
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}

/** One column's checkbox, labelled with the column name and its tooltip. */
function ColumnOption({
  columnKey,
  checked,
  onCheckedChange,
}: {
  columnKey: ColumnKey;
  checked: boolean;
  onCheckedChange: (on: boolean) => void;
}) {
  const { label, title } = listMessages().columns[columnKey];
  return (
    <li className="px-2">
      <label
        htmlFor={`column-${columnKey}`}
        className="flex items-center gap-2.5 rounded-md px-2 py-1 text-sm hover:bg-accent"
        title={title}
      >
        <Checkbox
          id={`column-${columnKey}`}
          checked={checked}
          onCheckedChange={(v) => onCheckedChange(v === true)}
        />
        {label}
      </label>
    </li>
  );
}
