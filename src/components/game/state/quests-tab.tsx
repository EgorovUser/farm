'use client';

/**
 * Таблица квестов (M15): день/неделя (роллы по dailySeed), цепочки под
 * гейтами, ачивки и флаги. Данные — те же строки quests list, что в консоли.
 */
import { useGameStore } from '@/stores/game-store';
import { getGame } from '@/game/game-instance';
import { rewardText, type QuestRow } from '@/stores/module-rows';
import type { Reward } from '@/content/quests/types';
import { EmptyHint } from '../panel';
import { Bar, CmdHint, Pill, Section } from './shared';

function rewardsLine(rewards: Reward[]): string {
  if (rewards.length === 0) return '—';
  const game = getGame();
  return rewards.map((r) => rewardText(game, r)).join(', ');
}

function QuestCard({ q }: { q: QuestRow }) {
  const pct = q.goal > 0 ? Math.round((Math.min(q.progress, q.goal) / q.goal) * 100) : 0;
  return (
    <div className="border-b border-zinc-800/60 py-2 last:border-0">
      <div className="flex items-baseline justify-between gap-2">
        <span className="min-w-0 truncate text-xs text-zinc-200" title={q.id}>
          {q.locked ? '🔒 ' : ''}
          {q.name}
          {q.stepsTotal > 1 && <span className="ml-1.5 font-mono text-[10px] text-zinc-600">шаг {q.step}/{q.stepsTotal}</span>}
        </span>
        <span className="shrink-0">
          {q.claimed ? (
            <Pill tone="dim">✓ забрано</Pill>
          ) : q.claimable ? (
            <Pill tone="ok">→ ЗАБРАТЬ</Pill>
          ) : q.locked ? (
            <Pill tone="dim">гейт</Pill>
          ) : (
            <span className="font-mono text-[10px] text-zinc-500">
              {q.progress}/{q.goal}
            </span>
          )}
        </span>
      </div>
      {q.locked && q.unlockText ? (
        <p className="mt-0.5 text-[10px] text-amber-500/80">{q.unlockText}</p>
      ) : (
        <p className="mt-0.5 truncate text-[10px] text-zinc-500" title={q.description}>
          {q.description}
        </p>
      )}
      <div className="mt-1">
        <Bar pct={pct} tone={q.claimable ? 'emerald' : 'amber'} />
      </div>
      <p className="mt-1 font-mono text-[10px] text-zinc-600">награды: {rewardsLine(q.rewards)}</p>
    </div>
  );
}

function QuestList({ rows, empty }: { rows: QuestRow[]; empty: string }) {
  if (rows.length === 0) return <p className="py-1 text-[11px] text-zinc-600 italic">{empty}</p>;
  return (
    <div>
      {rows.map((q) => (
        <QuestCard key={q.id} q={q} />
      ))}
    </div>
  );
}

export function QuestsTab() {
  const quests = useGameStore((s) => s.quests);
  if (!quests) return <EmptyHint>модуль квестов не активен</EmptyHint>;
  const unlocked = quests.achievements.filter((a) => a.unlocked);
  const claimableAch = unlocked.filter((a) => !a.claimed).length;
  return (
    <div>
      <CmdHint>
        квесты дня/недели — детерминированные роллы (dailySeed от saveId) · claim: quests claim &lt;id&gt; · замена: quests reroll &lt;id&gt;
      </CmdHint>
      <Section title={`Квесты дня (${quests.daily.length})`} />
      <QuestList rows={quests.daily} empty="пусто (ролл — quests roll / смена дня time +1d)" />
      <Section title={`Квесты недели (${quests.weekly.length})`} />
      <QuestList rows={quests.weekly} empty="пусто" />
      <Section title={`Цепочки (${quests.chains.length})`} />
      <QuestList rows={quests.chains} empty="цепочек нет" />
      <Section
        title={`Ачивки (${unlocked.length}/${quests.achievements.length})`}
        right={claimableAch > 0 ? <Pill tone="ok">к забору: {claimableAch}</Pill> : undefined}
      />
      <div className="max-h-56 overflow-y-auto pr-1">
        {quests.achievements.map((a) => (
          <div key={a.id} className="flex items-baseline justify-between gap-2 border-b border-zinc-800/60 py-1 last:border-0">
            <span className="min-w-0 truncate text-[11px] text-zinc-300" title={`${a.id} · награды: ${rewardsLine(a.rewards)}`}>
              {a.unlocked ? <span className="mr-1 text-emerald-400">✓</span> : <span className="mr-1 text-zinc-600">○</span>}
              {a.name}
            </span>
            <span className="shrink-0 font-mono text-[10px] text-zinc-600">
              {a.claimed ? 'забрано' : a.unlocked ? '→ claim' : ''}
            </span>
          </div>
        ))}
      </div>
      <Section title={`Флаги (${quests.flags.length})`} />
      {quests.flags.length === 0 ? (
        <p className="text-[11px] text-zinc-600 italic">флагов нет (ачивки/цепочки их производят)</p>
      ) : (
        <div className="flex flex-wrap gap-1">
          {quests.flags.map((f) => (
            <Pill key={f} tone="info">{f}</Pill>
          ))}
        </div>
      )}
    </div>
  );
}
