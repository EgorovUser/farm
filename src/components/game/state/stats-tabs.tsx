'use client';

/**
 * Таблицы ядра и игрока: Статы · Навыки · Бафы · Роллы · Pity · Счётчики.
 * Перенос из state-panel.tsx (расщепление при росте вкладок, 01 §6).
 */
import { useGameStore } from '@/stores/game-store';
import { OP_LABELS_RU } from '@/content/locale/ru';
import { formatClock, formatDuration } from '@/shared/utils/format';
import { EmptyHint } from '../panel';
import { Bar, CmdHint, Row } from './shared';

export function StatsTab() {
  const stats = useGameStore((s) => s.stats);
  const providers = useGameStore((s) => s.providers);
  return (
    <div>
      <CmdHint>
        каталог bases (ядро + модули) — провайдеры: {providers.length ? providers.join(', ') : 'нет'}
      </CmdHint>
      {stats.map((s) => (
        <Row
          key={s.stat}
          label={s.stat}
          value={s.final === s.base ? `${s.final}` : `${s.base} → ${s.final}`}
          tone={s.final !== s.base ? 'text-amber-300' : undefined}
          hint={s.final !== s.base ? 'значение изменено модификаторами' : 'база без модов'}
        />
      ))}
    </div>
  );
}

export function SkillsTab() {
  const player = useGameStore((s) => s.player);
  if (!player) return <EmptyHint>модуль player не активен</EmptyHint>;
  return (
    <div>
      <CmdHint>навыки от использования (M01 §5): XP за события · перки — провайдер player.skills</CmdHint>
      {player.skills.map((sk) => {
        const pct = sk.xpNeed > 0 ? Math.min(100, Math.round((sk.xp / sk.xpNeed) * 100)) : 0;
        return (
          <div key={sk.id} className="border-b border-zinc-800/60 py-1.5 last:border-0">
            <div className="flex items-baseline justify-between gap-2">
              <span className="truncate text-xs text-zinc-300">
                {sk.name}
                <span className="ml-1.5 text-[10px] text-zinc-600">{sk.id}</span>
              </span>
              <span className="shrink-0 font-mono text-[11px] text-zinc-200">
                ур. <span className="text-amber-300">{sk.level}</span>
              </span>
            </div>
            <div className="mt-1">
              <Bar pct={pct} label={`${sk.xp}/${sk.xpNeed}`} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function BuffsTab() {
  const buffs = useGameStore((s) => s.buffs);
  const now = useGameStore((s) => s.now);
  if (buffs.length === 0) return <EmptyHint>бафов нет — mod add player.luck flat 100 10m</EmptyHint>;
  return (
    <div>
      <CmdHint>моды StatBus с TTL: плоско/%/мультипликатив — трасса resolve &lt;stat&gt;</CmdHint>
      {buffs.map((b) => (
        <div key={b.id} className="border-b border-zinc-800/60 py-2 last:border-0">
          <div className="flex items-baseline justify-between gap-2">
            <span className="truncate font-mono text-[11px] text-amber-300">{b.id}</span>
            <span className="shrink-0 font-mono text-[11px] text-zinc-200">
              {OP_LABELS_RU[b.op] ?? b.op} {b.value > 0 ? '+' : ''}
              {b.value}
            </span>
          </div>
          <div className="mt-0.5 flex justify-between font-mono text-[10px] text-zinc-500">
            <span>{b.stat}</span>
            <span>
              {b.runs ? 'до конца забега' : b.expiresAt ? `осталось ${formatDuration(b.expiresAt - now)}` : 'бессрочно'}
              {b.tags.length > 0 ? ` · [${b.tags.join(',')}]` : ''}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

export function RollsTab() {
  const rollLog = useGameStore((s) => s.rollLog);
  if (rollLog.length === 0) return <EmptyHint>журнал пуст — roll demo.loot 20</EmptyHint>;
  return (
    <div>
      <CmdHint>журнал RngBus (последние 40): поток → значение · luck влияет на веса</CmdHint>
      {rollLog.map((r, i) => (
        <div key={`${r.at}-${i}`} className="border-b border-zinc-800/60 py-1.5 last:border-0 font-mono text-[11px]">
          <div className="flex justify-between text-zinc-500">
            <span>{formatClock(r.at)}</span>
            <span>{r.kind}</span>
          </div>
          <div className="flex justify-between gap-2">
            <span className="truncate text-zinc-400">{r.input}</span>
            <span className="text-amber-300">{r.output}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

export function PityTab() {
  const pity = useGameStore((s) => s.pity);
  if (pity.length === 0) return <EmptyHint>счётчиков нет — pity bump player forge.fail</EmptyHint>;
  return (
    <div>
      <CmdHint>счётчики pity: защита от сухих серий (ядро)</CmdHint>
      {pity.map((p) => (
        <Row key={`${p.ownerId}|${p.key}`} label={`${p.ownerId} · ${p.key}`} value={String(p.value)} />
      ))}
    </div>
  );
}

export function CountersTab() {
  const counters = useGameStore((s) => s.counters);
  return (
    <div>
      <CmdHint>счётчики растут от событий шины (wallet.transaction, farm.cropHarvested…) — их читают квесты M15</CmdHint>
      {counters.length === 0 ? (
        <EmptyHint>счётчики появятся от игровых событий</EmptyHint>
      ) : (
        counters.map((c) => <Row key={c.id} label={c.id} value={String(c.value)} />)
      )}
    </div>
  );
}
