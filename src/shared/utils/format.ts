/** Форматирование чисел/дат для UI и debug-консоли. Локаль — русская. */
import { MS_DAY, MS_HOUR } from './math';

export function formatNumber(v: number, fractionDigits = 0): string {
  return new Intl.NumberFormat('ru-RU', {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(v);
}

export function formatCurrency(v: number): string {
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return `${formatNumber(v / 1_000_000, 1)}M`;
  if (abs >= 10_000) return `${formatNumber(v / 1000, 1)}k`;
  return formatNumber(v, abs % 1 === 0 ? 0 : 1);
}

export function formatDateTime(epochMs: number): string {
  return new Intl.DateTimeFormat('ru-RU', {
    dateStyle: 'short',
    timeStyle: 'medium',
  }).format(new Date(epochMs));
}

export function formatClock(epochMs: number): string {
  return new Intl.DateTimeFormat('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date(epochMs));
}

export function formatDuration(ms: number): string {
  if (ms < 0) ms = 0;
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}ч ${m}м`;
  if (m > 0) return `${m}м ${s}с`;
  return `${s}с`;
}

/** '10m' | '2h' | '3d' | '45s' → миллисекунды (для debug-команд и duration) */
export function parseDurationToMs(input: string): number | null {
  const m = /^(\d+)\s*(s|m|h|d|мин|ч|с|д|сек|минут|час|дн|день|дня|дней)$/.exec(input.trim().toLowerCase());
  if (!m) return null;
  const n = Number(m[1]);
  if (!Number.isFinite(n) || n < 0) return null;
  switch (m[2]) {
    case 's':
    case 'с':
    case 'сек':
      return n * 1000;
    case 'm':
    case 'мин':
    case 'минут':
      return n * 60_000;
    case 'h':
    case 'ч':
    case 'час':
      return n * MS_HOUR;
    case 'd':
    case 'д':
    case 'дн':
    case 'день':
    case 'дня':
    case 'дней':
      return n * MS_DAY;
    default:
      return null;
  }
}
