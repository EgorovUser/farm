/**
 * Разбор ручных ctx-ключей команды resolve (MISS-4). Вынесен из commands-core
 * в чистую функцию для self-проверок (FIX-M01 · MISS-7): без консольных
 * зависимостей, детерминирован.
 *
 * [DECISION] Синтаксис — `[tag=t1,t2]`: мульти-теги через запятую внутри
 * ОДНОГО ключа tag (SESSION-M01 §3.2.2 предлагал `[tags=…]` — ратифицировано
 * единственное имя tag, 2026-10-22, FIX-M01 §2.6). Usage-строка ниже —
 * самодокументируется в отказе.
 */
import { err, ok, type Result } from '@/shared/types/result';

export interface ResolveKeys {
  tags: string[];
  extra: Record<string, unknown>;
}

export const RESOLVE_KEYS_USAGE = '[tag=t] [lvl=N] [skill:id=N] [flag=f] [item:defId=N] [ach=id]';

/**
 * Разобрать токены вида [tag=a,b] [lvl=5] … Возвращает ручные ключи;
 * мусор/кириллица — отказ с usage. Слияние с ctxExtras (приоритет ручных)
 * выполняет вызывающий: `{ ...playerExtras, ...keys.extra }`.
 */
export function parseResolveKeys(tokens: readonly string[]): Result<ResolveKeys> {
  const tags: string[] = [];
  const extra: Record<string, unknown> = {};
  for (const token of tokens) {
    let m = /^\[tag=([A-Za-z0-9_,:.-]+)\]$/.exec(token);
    if (m) {
      tags.push(...m[1].split(','));
      continue;
    }
    m = /^\[lvl=(\d+)\]$/.exec(token);
    if (m) {
      extra['player:level'] = Number(m[1]);
      continue;
    }
    m = /^\[skill:([A-Za-z0-9_.-]+)=(\d+)\]$/.exec(token);
    if (m) {
      extra[`skill:${m[1]}`] = Number(m[2]);
      continue;
    }
    m = /^\[flag=([A-Za-z0-9_.:-]+)\]$/.exec(token);
    if (m) {
      extra[`flag:${m[1]}`] = true;
      continue;
    }
    m = /^\[item:([A-Za-z0-9_:-]+)=(\d+)\]$/.exec(token);
    if (m) {
      extra[`item:${m[1]}`] = Number(m[2]);
      continue;
    }
    m = /^\[ach=([A-Za-z0-9_.:-]+)\]$/.exec(token);
    if (m) {
      extra[`achievement:${m[1]}`] = true;
      continue;
    }
    return err(`ключ "${token}" не разобран — ${RESOLVE_KEYS_USAGE}`);
  }
  return ok({ tags, extra });
}
