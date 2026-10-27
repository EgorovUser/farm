'use client';

/**
 * Таблица загона (M06): животные (уход/болезни/производство), склады по
 * загонам, навоз, разведение, улучшения. Данные — витрина pen.state
 * (publicApi; sweep recover→produce→birth уже выполнен).
 */
import { useGameStore } from '@/stores/game-store';
import { getGame } from '@/game/game-instance';
import { penUpgradeNamesOf, type AnimalView } from '@/stores/module-rows';
import { formatDuration } from '@/shared/utils/format';
import { cn } from '@/lib/utils';
import { EmptyHint } from '../panel';
import { CmdHint, Pill, Row, Section } from './shared';

const TIER_TONES: Record<string, string> = {
  D: 'text-zinc-500',
  C: 'text-zinc-300',
  B: 'text-amber-400',
  A: 'text-emerald-400',
  S: 'text-emerald-300',
  SS: 'text-amber-200',
};

function statTone(v: number): string {
  if (v < 40) return 'text-red-400';
  if (v < 70) return 'text-amber-400';
  return 'text-zinc-300';
}

function Stat({ icon, v, label }: { icon: string; v: number; label: string }) {
  return (
    <span className={cn('font-mono text-[10px]', statTone(v))} title={`${label}: ${v}`}>
      {icon}
      {v}
    </span>
  );
}

function AnimalRow({ a }: { a: AnimalView }) {
  return (
    <div className="border-b border-zinc-800/60 py-2 last:border-0">
      <div className="flex items-baseline justify-between gap-2">
        <span className="min-w-0 truncate text-xs text-zinc-200">
          <span className="mr-1 font-mono text-[10px] text-zinc-600">#{a.idx}</span>
          {a.name}
          <span className={cn('ml-1.5 font-mono text-[10px]', TIER_TONES[a.quality] ?? 'text-zinc-400')}>{a.quality}</span>
        </span>
        <span className="flex shrink-0 items-center gap-1">
          {a.sick && <Pill tone="err" title={`лечение: ${a.healRemainingMs !== null ? formatDuration(a.healRemainingMs) : '…'} (самолечение 48ч)`}>больна</Pill>}
          {a.immuneRemainingMs !== null && !a.sick && <Pill tone="info">иммуно {formatDuration(a.immuneRemainingMs)}</Pill>}
          {a.producing ? (
            a.remainingMs !== null && a.remainingMs <= 0 ? (
              <Pill tone="ok">к сбору</Pill>
            ) : (
              <Pill tone="dim">{a.remainingMs !== null ? formatDuration(a.remainingMs) : '…'}</Pill>
            )
          ) : (
            <Pill tone="warn" title="needsMet: сытость/здоровье">не производит</Pill>
          )}
        </span>
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1">
        <Stat icon="❤" v={a.health} label="здоровье" />
        <Stat icon="☀" v={a.happiness} label="счастье (с бонусом «Люкс»)" />
        <Stat icon="🍖" v={a.satiety} label="сытость" />
        <Stat icon="🧼" v={a.cleanliness} label="чистота" />
        <span className="font-mono text-[10px] text-zinc-600" title="уход сегодня">
          {a.fedToday ? '✓сыт' : '—сыт'} · {a.pettedToday ? '✓гладят' : '—гладят'}
          {a.hungryDays > 0 ? ` · голодных дней: ${a.hungryDays}` : ''}
          {a.dirtyDays > 0 ? ` · грязных дней: ${a.dirtyDays}` : ''}
        </span>
      </div>
    </div>
  );
}

function PenBlock({ title, pen }: { title: string; pen: { slots: { used: number; base: number }; animals: AnimalView[]; stock: Array<{ defId: string; qty: number; cap: number }>; overflow: Record<string, number> } }) {
  const game = getGame();
  return (
    <div>
      <Section
        title={title}
        right={
          <span className="font-mono text-[10px] text-zinc-500">
            слоты {pen.slots.used}/{pen.slots.base}
          </span>
        }
      />
      {pen.animals.length === 0 ? (
        <p className="py-1 text-[11px] text-zinc-600 italic">пусто — pen buy chicken</p>
      ) : (
        pen.animals.map((a) => <AnimalRow key={`${a.pen}-${a.idx}`} a={a} />)
      )}
      {pen.stock.length > 0 && (
        <div className="mt-1">
          {pen.stock.map((s) => (
            <Row
              key={s.defId}
              label={`${game.content.tryItem(s.defId)?.name ?? s.defId} (${s.defId})`}
              value={`×${s.qty} / кап ${s.cap}`}
              tone={s.qty >= s.cap ? 'text-amber-400' : undefined}
              hint="склад продукции загона: cap 3 сбора × qty вида"
            />
          ))}
          {Object.entries(pen.overflow).map(([defId, lost]) => (
            <Row
              key={`ovf-${defId}`}
              label={`потеряно сверх капа: ${defId}`}
              value={`×${lost}`}
              tone="text-red-400"
              hint="overflow-отчёт среза (F7): накопительно"
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function PenTab() {
  const pen = useGameStore((s) => s.pen);
  if (!pen) return <EmptyHint>модуль загона не активен</EmptyHint>;
  const upgradeNames = penUpgradeNamesOf(getGame());
  const upgradeIds = Object.keys(pen.upgrades);
  return (
    <div>
      <CmdHint>витрина pen.state: животные · болезни/иммунитет · продукция на складах — загон (M06)</CmdHint>
      <PenBlock title="Загон 1" pen={pen} />
      {pen.pen2 && <PenBlock title="Загон 2 (улучшение)" pen={pen.pen2} />}
      <Section title="Хозяйство" />
      <Row label="навоз (буфер)" value={`${pen.manure.manure} / кап ${pen.manure.cap}`} hint="+1 за кормление · обмен: pen.manure take" />
      {pen.breeding ? (
        <Row
          label={`разведение · ${pen.breeding.speciesId}`}
          value={pen.breeding.waitingSlot ? 'ждёт слот' : formatDuration(pen.breeding.remainingMs)}
          hint={`потомок от пары, тир родителя: ${pen.breeding.maxParentTier} · pen.breed <idx1> <idx2>`}
        />
      ) : (
        <Row label="разведение" value="нет (pen.breed <idx1> <idx2>)" />
      )}
      <Row label="репутация деревни" value={pen.reputationReady ? 'готова' : 'заглушка до M16'} />
      {upgradeIds.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-1">
          {upgradeIds.map((id) => (
            <Pill key={id} tone="warn">
              {upgradeNames[id] ?? id}
              {pen.upgrades[id]! > 1 ? ` ×${pen.upgrades[id]}` : ''}
            </Pill>
          ))}
        </div>
      ) : (
        <p className="mt-2 text-[10px] text-zinc-600">улучшений нет — pen.upgrades (амбар, автокормушки, второй загон…)</p>
      )}
      <p className="mt-3 text-[10px] leading-snug text-zinc-600">
        действия: pen buy/feed/clean/pet/collect/heal/breed/sell [1|2] · dev: pen.sick · pen.produce
      </p>
    </div>
  );
}
