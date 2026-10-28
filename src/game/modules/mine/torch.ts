/**
 * Факел M13.1 (бриф R5, карточка §3): расходник run.torches — вскрывает 1
 * скрытую карту текущей/соседней колонки. Семантика ПО ДАННЫМ (MINE_TORCH):
 * 'direct' — гарантированно; 'luck' — ролл с удачей mine.luck.hidden
 * (02-BUSES §6): chance = clamp(base × (1 + mine.luck.hidden/100), 0, 100);
 * дефолт base 100 ⇒ без дебафов гарантированно [DECISION R5].
 * Роллы — живые стримы mine:run:torch:* (журнал roll.log, П6).
 */
import type { Result } from '@/shared/types/result';
import { err, ok } from '@/shared/types/result';
import { MINE_TORCH } from '@/content/mine/cards';
import { CARDS_PER_COLUMN } from './generator';
import type { RunCtx } from './run';
import type { MineRunState, RunCard } from './state';

export interface TorchResult {
  header: string;
  lines: string[];
}

/** скрытые карты текущей и следующей колонки (порядок цели) */
function hiddenTargets(run: MineRunState): Array<{ card: RunCard; column: number; label: string }> {
  const out: Array<{ card: RunCard; column: number; label: string }> = [];
  for (const col of [run.column, run.column + 1]) {
    if (col > 5) continue;
    const from = (col - 1) * CARDS_PER_COLUMN;
    const to = col >= 5 ? run.cards.length : from + CARDS_PER_COLUMN;
    run.cards.slice(from, to).forEach((c, i) => {
      if (c.hidden && c.destroyed !== true && c.revealed !== true && c.resolved !== true) {
        out.push({ card: c, column: col, label: `колонка ${col}, карта ${i + 1}` });
      }
    });
  }
  return out;
}

/** mine torch [i]: без аргумента — первая скрытая (текущая, затем соседняя) */
export function applyTorch(x: RunCtx, argRaw?: string): Result<TorchResult> {
  const run = x.getState().run;
  if (run === undefined) {
    return err('забега нет — факелы живут в забеге (mine enter <слой>)');
  }
  if (run.torches < 1) {
    return err('нет факелов (находятся в сундуках/лагерях, продаёт крот: mine pick у торговца)');
  }
  const targets = hiddenTargets(run);
  if (targets.length === 0) {
    return err('скрытых карт в текущей/соседней колонке нет — факел не нужен');
  }
  let target = targets[0]!;
  if (argRaw !== undefined) {
    const i = Number(argRaw);
    if (!Number.isInteger(i) || i < 1 || i > targets.length) {
      return err(`нет цели №${i} (скрытых карт рядом: ${targets.length}; mine torch без аргумента — первая)`);
    }
    target = targets[i - 1]!;
  }
  // ролл успеха: данные MINE_TORCH + живой канал mine.luck.hidden
  const ctx = { ...x.time.ctx('player'), tags: ['mine', `layer:${run.layer}`] };
  const luck = x.statBus.resolve({ stat: 'mine.luck.hidden', ctx });
  const chance = Math.min(100, Math.max(0, MINE_TORCH.base * (1 + luck / 100)));
  const u = x.rngBus.rollRange(0, 1, 'uniform', `mine:run:torch:${run.runNumber}`);
  const success = MINE_TORCH.mode === 'direct' || u * 100 < chance;
  run.torches -= 1;
  const lines = [
    `цель: ${target.label} · режим ${MINE_TORCH.mode === 'direct' ? 'direct (гарантированно)' : `luck (base ${MINE_TORCH.base} × (1 + mine.luck.hidden ${luck}/100) → шанс ${chance.toFixed(1)}%)`}`,
  ];
  if (success) {
    target.card.revealed = true;
    lines.push(`факел вспыхнул — карта раскрыта: «${cardTitle(target.card)}» (run.torches → ${run.torches})`);
  } else {
    lines.push(`факел зашипел и погас — карта осталась скрытой (run.torches → ${run.torches})`);
  }
  x.markDirty();
  return ok({ header: 'Факел', lines });
}

/** название карты для витрины (kind + контекст) */
export function cardTitle(card: import('./state').RunCard): string {
  switch (card.kind) {
    case 'empty':
      return 'пустая пещера';
    case 'oreVein':
      return 'рудная жила';
    case 'chest':
      return 'сундук';
    case 'collapse':
      return 'обвал';
    case 'mob':
      return `моб: ${card.mobId ?? '?'}${card.elite !== null && card.elite !== undefined ? ` (${card.elite})` : ''}`;
    case 'boss':
      return `босс: ${String(card.payload)}`;
    case 'altar':
      return 'алтарь';
    case 'spring':
      return 'родник';
    case 'campfire':
      return 'костёр';
    case 'trader':
      return 'торговец-крот';
    case 'camp':
      return 'заброшенный лагерь';
    case 'exit':
      return 'лестница вверх';
    default:
      return String(card.kind);
  }
}
