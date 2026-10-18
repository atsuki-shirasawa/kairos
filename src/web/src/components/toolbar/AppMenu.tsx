import { Ellipsis, Monitor, Moon, Sun } from "lucide-react";
import type { ReactNode } from "react";
import { SEGMENT, SEGMENTED } from "@/components/segmented.ts";
import { Button } from "@/components/ui/button.tsx";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover.tsx";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group.tsx";
import { useShowHeadless } from "@/hooks/queries.ts";
import type { Theme } from "@/hooks/useTheme.ts";
import { LOCALES, type Locale, setLocale, useLocale } from "@/i18n/index.ts";
import { toolbarMessages } from "@/i18n/messages/toolbar.ts";
import { keyCap, SHORTCUT_GROUPS, type ShortcutGroup } from "@/lib/shortcuts.ts";
import { cn } from "@/lib/utils.ts";

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

/** The menu's label for each line of the shortcut list. */
function groupLabel(group: ShortcutGroup): string {
  const m = toolbarMessages();
  const labels: Record<ShortcutGroup, string> = {
    period: m.shortcutPeriod,
    today: m.shortcutToday,
    view: m.shortcutView,
    layout: m.shortcutLayout,
    table: m.shortcutTable,
    step: m.shortcutStep,
    search: m.shortcutSearch,
    close: m.shortcutClose,
    menu: m.shortcutMenu,
  };
  return labels[group];
}

/** The keyboard shortcuts as key caps and labels, from the key map in lib/shortcuts.ts. */
function shortcuts(): [string[], string][] {
  return SHORTCUT_GROUPS.map(({ group, shortcuts: members }) => [
    members.map(keyCap),
    groupLabel(group),
  ]);
}

/**
 * The "⋯" menu: theme, language, whether headless runs show, and the keyboard shortcuts. The
 * caller owns the open state because `?` opens it too.
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
        <Button variant="ghost" size="icon" aria-label={m.menu} title={m.menuTitle}>
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
        <SettingRow label={m.headlessRuns} title={m.headlessRunsTitle}>
          <HeadlessToggle />
        </SettingRow>
        <ShortcutList />
      </PopoverContent>
    </Popover>
  );
}

/** A labelled setting with its control on the right. `title` explains the label on hover. */
function SettingRow({
  label,
  title,
  children,
}: {
  label: string;
  title?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-2 border-b p-3">
      <span className="font-medium text-body" title={title}>
        {label}
      </span>
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

/** Hides or shows headless runs (claude -p / SDK sessions). Saved on the server. */
function HeadlessToggle() {
  const m = toolbarMessages();
  const [show, setShow, loaded] = useShowHeadless();
  return (
    <ToggleGroup
      type="single"
      size="sm"
      spacing={0.5}
      className={SEGMENTED}
      value={show ? "show" : "hide"}
      onValueChange={(v) => v && setShow(v === "show")}
      // Until the settings load, "Hide" would only be a guess
      disabled={!loaded}
      aria-label={m.headlessRuns}
    >
      <ToggleGroupItem value="hide" className={cn(SEGMENT, "px-2")}>
        {m.hide}
      </ToggleGroupItem>
      <ToggleGroupItem value="show" className={cn(SEGMENT, "px-2")}>
        {m.show}
      </ToggleGroupItem>
    </ToggleGroup>
  );
}

/** The keyboard shortcuts as key caps beside what they do. */
function ShortcutList() {
  const m = toolbarMessages();
  return (
    <div className="p-3">
      <p className="mb-2 font-medium text-body">{m.shortcuts}</p>
      <dl className="grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-1.5 text-body">
        {shortcuts().map(([keys, label]) => (
          <div key={label} className="contents">
            <dt className="flex gap-1">
              {keys.map((k) => (
                <kbd
                  key={k}
                  className="min-w-6 rounded border bg-muted px-1.5 text-center font-num text-label leading-5"
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
