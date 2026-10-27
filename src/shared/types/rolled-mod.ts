/**
 * Ривен-ролл — ОБЩИЙ контракт 03-DATA §5 (RolledMod).
 * [DECISION · M03.2] тип перенесён из modules/inventory/state.ts в shared:
 * контракт перекрёстный (генерация — M03, хранение/применение — M02,
 * карточки заточки — M10, трейты — M11/M13), а прямой импорт между игровыми
 * модулями запрещён (П4). Инвентарь реэкспортирует тип для обратной
 * совместимости; здесь же — структурный проверщик формы (П5: мусор — не ошибка).
 */
import type { ID } from './ids';

export interface RolledModEntry {
  type: ID;
  value: number;
  from: 'initial' | 'forge';
  forgeLevel?: number;
}

/** структурная проверка формы ривен-ролла (загрузки/чужие писатели, П5) */
export function isRolledModEntry(v: unknown): v is RolledModEntry {
  if (!v || typeof v !== 'object') return false;
  const r = v as Record<string, unknown>;
  return (
    typeof r.type === 'string' &&
    r.type !== '' &&
    typeof r.value === 'number' &&
    Number.isFinite(r.value) &&
    (r.from === undefined || r.from === 'initial' || r.from === 'forge') &&
    (r.forgeLevel === undefined || (typeof r.forgeLevel === 'number' && Number.isFinite(r.forgeLevel)))
  );
}
