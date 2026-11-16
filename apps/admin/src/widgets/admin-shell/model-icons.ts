import { isModelIconEmoji, isModelIconName, type MODEL_ICON_NAMES } from "@lacecms/content";
import {
  BookOpen,
  CalendarDays,
  FileText,
  Globe,
  House,
  Images,
  Layers,
  Menu,
  Newspaper,
  Settings,
  Tags,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { IconName } from "lucide-react/dynamic";

const icons = {
  "book-open": BookOpen,
  "calendar-days": CalendarDays,
  "file-text": FileText,
  globe: Globe,
  house: House,
  images: Images,
  layers: Layers,
  menu: Menu,
  newspaper: Newspaper,
  settings: Settings,
  tags: Tags,
  users: Users,
} satisfies Record<(typeof MODEL_ICON_NAMES)[number], LucideIcon> &
  Partial<Record<IconName, LucideIcon>>;

export type ModelNavigationIcon = LucideIcon | string;

export function resolveModelNavigationIcon(
  icon: string | undefined,
  fallback: LucideIcon,
): ModelNavigationIcon {
  if (icon === undefined) return fallback;
  if (isModelIconName(icon)) return icons[icon];
  return isModelIconEmoji(icon) ? icon : fallback;
}
