import type { Scope, TransformFn } from "../types";

function getLocale(_scope: Scope): string {
  return "en-US"; // Could be extended via scope or options
}

export const formatTransforms: Record<string, TransformFn> = {
  currency: (value, args, scope) => {
    const num = Number(value);
    const currency = String(args[0] ?? "USD");
    const locale = getLocale(scope);

    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
    }).format(num);
  },

  date: (value, args, scope) => {
    const date = value instanceof Date ? value : new Date(value as string | number);
    if (Number.isNaN(date.getTime())) return String(value);

    const format = String(args[0] ?? "medium");
    const locale = getLocale(scope);

    if (format === "relative") {
      return formatRelativeTime(date);
    }

    const options = getDateFormatOptions(format);
    return new Intl.DateTimeFormat(locale, options).format(date);
  },

  time: (value, args, scope) => {
    const date = value instanceof Date ? value : new Date(value as string | number);
    if (Number.isNaN(date.getTime())) return String(value);

    const format = String(args[0] ?? "short");
    const locale = getLocale(scope);

    const options: Intl.DateTimeFormatOptions =
      format === "24h"
        ? { hour: "2-digit", minute: "2-digit", hour12: false }
        : { hour: "numeric", minute: "2-digit" };

    return new Intl.DateTimeFormat(locale, options).format(date);
  },

  duration: (value) => {
    const seconds = Number(value);
    if (Number.isNaN(seconds)) return String(value);

    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);

    if (mins >= 60) {
      const hours = Math.floor(mins / 60);
      const remainingMins = mins % 60;
      return `${hours}:${remainingMins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
    }

    return `${mins}:${secs.toString().padStart(2, "0")}`;
  },

  bytes: (value) => {
    const bytes = Number(value);
    if (Number.isNaN(bytes)) return String(value);

    const units = ["B", "KB", "MB", "GB", "TB"];
    let unitIndex = 0;
    let size = bytes;

    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }

    return `${size.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
  },

  ordinal: (value) => {
    const num = Number(value);
    if (Number.isNaN(num)) return String(value);

    const suffix = getOrdinalSuffix(num);
    return `${num}${suffix}`;
  },

  pluralize: (value, args) => {
    const count = Number(value);
    const singular = String(args[0] ?? "");
    const plural = String(args[1] ?? singular + "s");

    return count === 1 ? singular : plural;
  },

  "number:format": (value, args, scope) => {
    const num = Number(value);
    const format = String(args[0] ?? "standard");
    const locale = getLocale(scope);

    if (format === "compact") {
      return new Intl.NumberFormat(locale, { notation: "compact" }).format(num);
    }

    return new Intl.NumberFormat(locale).format(num);
  },

  "percent:format": (value, _args, scope) => {
    const num = Number(value);
    const locale = getLocale(scope);

    return new Intl.NumberFormat(locale, {
      style: "percent",
      maximumFractionDigits: 0,
    }).format(num / 100);
  },
};

function getDateFormatOptions(format: string): Intl.DateTimeFormatOptions {
  switch (format) {
    case "short":
      return { dateStyle: "short" };
    case "medium":
      return { dateStyle: "medium" };
    case "long":
      return { dateStyle: "long" };
    case "full":
      return { dateStyle: "full" };
    default:
      // Custom format - return medium as default
      return { dateStyle: "medium" };
  }
}

function formatRelativeTime(date: Date): string {
  const now = Date.now();
  const diff = now - date.getTime();
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (seconds < 60) return "just now";
  if (minutes < 60) return `${minutes} minute${minutes > 1 ? "s" : ""} ago`;
  if (hours < 24) return `${hours} hour${hours > 1 ? "s" : ""} ago`;
  if (days < 7) return `${days} day${days > 1 ? "s" : ""} ago`;
  if (days < 30) return `${Math.floor(days / 7)} week${days >= 14 ? "s" : ""} ago`;
  if (days < 365) return `${Math.floor(days / 30)} month${days >= 60 ? "s" : ""} ago`;

  return `${Math.floor(days / 365)} year${days >= 730 ? "s" : ""} ago`;
}

function getOrdinalSuffix(num: number): string {
  const j = num % 10;
  const k = num % 100;

  if (j === 1 && k !== 11) return "st";
  if (j === 2 && k !== 12) return "nd";
  if (j === 3 && k !== 13) return "rd";
  return "th";
}
