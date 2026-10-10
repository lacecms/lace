import { useId, useRef } from "react";
import { ChevronsUpDown, LogOut, Monitor, Moon, Sun, UserRound } from "lucide-react";
import { roleLabel as labelOfRole, type AdminRole } from "../../../entities/session/index.js";
import {
  themePreferences,
  useThemePreference,
  type ThemePreference,
} from "../../../shared/lib/index.js";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../../../shared/ui/DropdownMenu/index.js";

const neutralName = "Signed-in user";

const themeOptions: Readonly<Record<ThemePreference, { label: string; icon: typeof Monitor }>> = {
  system: { label: "System", icon: Monitor },
  light: { label: "Light", icon: Sun },
  dark: { label: "Dark", icon: Moon },
};

function isThemePreference(value: string): value is ThemePreference {
  return (themePreferences as readonly string[]).includes(value);
}

/** Up to two initials from a display name, or the first letter of an email. */
function initialsOf(name: string | undefined): string {
  if (name === undefined) return "";
  const words = name.includes("@") ? [name] : name.split(/\s+/u).filter(Boolean);
  return words
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? "")
    .join("");
}

/**
 * The signed-in user's name and role with Account, theme selection, and log
 * out; never shows the user ID.
 */
export function UserMenu({
  displayName,
  onAccount,
  onSignOut,
  onIntroduction,
  role,
  signingOut,
}: {
  readonly displayName?: string | undefined;
  readonly onAccount?: (() => void) | undefined;
  readonly onIntroduction?: ((opener: HTMLElement | null) => void) | undefined;
  readonly onSignOut: () => void;
  readonly role: AdminRole;
  readonly signingOut: boolean;
}) {
  const trigger = useRef<HTMLButtonElement>(null);
  const replayPending = useRef(false);
  const themeLabel = useId();
  const theme = useThemePreference();
  const name = displayName ?? neutralName;
  const roleLabel = labelOfRole(role);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        ref={trigger}
        aria-label={`${name}, ${roleLabel}, account menu`}
        className="flex w-full min-w-0 cursor-pointer items-center gap-2 rounded-md p-2 text-left text-sm transition-colors duration-(--duration-fast) hover:bg-sidebar-accent hover:text-sidebar-accent-foreground data-[state=open]:bg-sidebar-accent"
      >
        <span
          aria-hidden="true"
          className="grid size-8 shrink-0 place-items-center rounded-md bg-primary text-xs font-semibold text-primary-foreground"
        >
          {initialsOf(displayName) || "?"}
        </span>
        <span className="grid min-w-0 flex-1 leading-tight">
          <span className="truncate font-medium" title={name}>
            {name}
          </span>
          <span className="truncate text-xs text-muted-foreground">{roleLabel}</span>
        </span>
        <ChevronsUpDown aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        onCloseAutoFocus={() => {
          if (replayPending.current) {
            replayPending.current = false;
            queueMicrotask(() => onIntroduction?.(trigger.current));
          }
        }}
        align="start"
        className="w-(--radix-dropdown-menu-trigger-width) min-w-56"
        side="top"
      >
        <DropdownMenuLabel className="grid font-normal">
          <span className="truncate font-medium" title={name}>
            {name}
          </span>
          <span className="text-xs text-muted-foreground">{roleLabel}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {onAccount && (
          <>
            <DropdownMenuItem onSelect={onAccount}>
              <UserRound aria-hidden="true" />
              Account
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        )}
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground" id={themeLabel}>
          Theme
        </DropdownMenuLabel>
        <DropdownMenuRadioGroup
          aria-labelledby={themeLabel}
          onValueChange={(value) => {
            if (isThemePreference(value)) theme.setPreference(value);
          }}
          value={theme.preference}
        >
          {themePreferences.map((value) => {
            const { icon: Icon, label } = themeOptions[value];
            return (
              <DropdownMenuRadioItem key={value} value={value}>
                <Icon aria-hidden="true" className="text-muted-foreground" />
                {label}
              </DropdownMenuRadioItem>
            );
          })}
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        {onIntroduction && (
          <DropdownMenuItem
            onSelect={() => {
              replayPending.current = true;
            }}
          >
            Introduction
          </DropdownMenuItem>
        )}
        <DropdownMenuItem disabled={signingOut} onSelect={onSignOut}>
          <LogOut aria-hidden="true" />
          {signingOut ? "Signing out…" : "Log out"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
