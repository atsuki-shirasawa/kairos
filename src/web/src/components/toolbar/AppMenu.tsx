import { Ellipsis, Monitor, Moon, Sun } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button.tsx";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover.tsx";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group.tsx";
import type { Theme } from "@/hooks/useTheme.ts";
import { LOCALES, type Locale, setLocale, useLocale } from "@/i18n/index.ts";
import { toolbarMessages } from "@/i18n/messages/toolbar.ts";
import { cn } from "@/lib/utils.ts";
import { SEGMENT, SEGMENTED } from "./segmented.ts";

/** The themes offered, with their labels and icons. */
function themes(): [Theme, string, typeof Sun][] {
  const m = toolbarMessages();
  return [
    ["system", m.themeSystem, Monitor],
    ["light", m.themeLight, Sun],
    ["dark", m.themeDark, Moon],
  ];
}

/** Each language's name is written in that language, so it can be found from either side. */
const LANGUAGE_NAMES: Record<Locale, string> = { en: "English", ja: "日本語" };

/** The keyboard shortcuts. The keys are handled in App.tsx's keydown listener. */
function shortcuts(): [string[], string][] {
  const m = toolbarMessages();
  return [
    [["←", "→"], m.shortcutPeriod],
    [["t"], m.shortcutToday],
    [["w", "d"], m.shortcutView],
    [["c", "s"], m.shortcutLayout],
    [["l"], m.shortcutTable],
    [["j", "k"], m.shortcutStep],
    [["/"], m.shortcutSearch],
    [["Esc"], m.shortcutClose],
    [["?"], m.shortcutMenu],
  ];
}

/**
 * The "⋯" menu: theme, language and the keyboard shortcuts. The caller owns the open state
 * because `?` opens it too.
 */
export function AppMenu({
  open,
  onOpenChange,
  theme,
  onTheme,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  theme: Theme;
  onTheme: (theme: Theme) => void;
}) {
  const m = toolbarMessages();
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={m.menu} title={m.menuTitle}>
          <Ellipsis />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 gap-0 p-0">
        <SettingRow label={m.theme}>
          <ThemeToggle theme={theme} onTheme={onTheme} />
        </SettingRow>
        <SettingRow label={m.language}>
          <LanguageToggle />
        </SettingRow>
        <ShortcutList />
      </PopoverContent>
    </Popover>
  );
}

/** A labelled setting with its control on the right. */
function SettingRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2 border-b p-3">
      <span className="font-medium text-sm">{label}</span>
      {children}
    </div>
  );
}

/** Picks the system, light or dark theme by icon. */
function ThemeToggle({ theme, onTheme }: { theme: Theme; onTheme: (theme: Theme) => void }) {
  return (
    <ToggleGroup
      type="single"
      size="sm"
      spacing={0.5}
      className={SEGMENTED}
      value={theme}
      onValueChange={(v) => v && onTheme(v as Theme)}
      aria-label={toolbarMessages().theme}
    >
      {themes().map(([value, label, Icon]) => (
        <ToggleGroupItem
          key={value}
          value={value}
          className={cn(SEGMENT, "px-2")}
          aria-label={label}
          title={label}
        >
          <Icon />
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}

/** Picks the UI language, which is saved per browser. */
function LanguageToggle() {
  const locale = useLocale();
  return (
    <ToggleGroup
      type="single"
      size="sm"
      spacing={0.5}
      className={SEGMENTED}
      value={locale}
      onValueChange={(v) => v && setLocale(v as Locale)}
      aria-label={toolbarMessages().language}
    >
      {LOCALES.map((value) => (
        <ToggleGroupItem key={value} value={value} lang={value} className={cn(SEGMENT, "px-2")}>
          {LANGUAGE_NAMES[value]}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}

/** The keyboard shortcuts as key caps beside what they do. */
function ShortcutList() {
  const m = toolbarMessages();
  return (
    <div className="p-3">
      <p className="mb-2 font-medium text-sm">{m.shortcuts}</p>
      <dl className="grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-1.5 text-sm">
        {shortcuts().map(([keys, label]) => (
          <div key={label} className="contents">
            <dt className="flex gap-1">
              {keys.map((k) => (
                <kbd
                  key={k}
                  className="min-w-6 rounded border bg-muted px-1.5 text-center font-num text-xs leading-5"
                >
                  {k}
                </kbd>
              ))}
            </dt>
            <dd className="text-muted-foreground">{label}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
