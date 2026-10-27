'use client';

/**
 * Таблица фермы (M05): вкладки тайлов (поле/теплица/грибница/виноградник),
 * статус каждого тайла FSM + сорняки/полив/удобрение, купленные улучшения.
 * Данные — витрина farm.state (publicApi, sweep уже выполнен).
 */
import { useState } from 'react';
import { useGameStore } from '@/stores/game-store';
import { getGame } from '@/game/game-instance';
import { farmNamesOf, type FarmTileView } from '@/stores/module-rows';
import { formatDuration } from '@/shared/utils/format';
import { cn } from '@/lib/utils';
import { EmptyHint } from '../panel';
import { CmdHint, Pill, Section } from './shared';
import type { FarmStateView } from '@/game/modules/farm/module';

const TAB_LABELS: Record<string, string> = {
  field: 'Поле',
  greenhouse: 'Теплица',
  mushroom: 'Грибница',
  vineyard: 'Виноградник',
};

const TILE_SKINS: Record<string, string> = {
  empty: 'border-zinc-800 bg-zinc-900/40',
  plowed: 'border-amber-900/50 bg-amber-950/20',
  growing: 'border-zinc-700 bg-zinc-900/70',
  ready: 'border-emerald-700/60 bg-emerald-950/30',
};

function TileBody({ t, now }: { t: FarmTileView; now: number }) {
  if (t.state === 'empty') return <span className="text-[10px] text-zinc-600">пусто</span>;
  if (t.state === 'plowed') return <span className="text-[10px] text-amber-500/80">вспахан</span>;
  if (t.state === 'ready') {
    return (
      <span className="text-[10px] leading-tight font-semibold text-emerald-400">
        ГОТОВ
        {t.harvestsLeft !== undefined ? ` · сборов ${t.harvestsLeft}` : ''}
        {t.fruitingUntil !== undefined && t.fruitingUntil > now ? ` · окно ${formatDuration(t.fruitingUntil - now)}` : ''}
      </span>
    );
  }
  // growing
  const dry = t.watered && !t.wet;
  return (
    <span className="text-[10px] leading-tight text-zinc-300">
      {t.remainingMs !== null ? formatDuration(t.remainingMs) : '…'}
      {dry && <span className="block text-amber-400">сухо — пауза</span>}
      {!t.watered && <span className="block text-zinc-500">не полит</span>}
    </span>
  );
}

function FarmTiles({ farm, names }: { farm: FarmStateView; names: { crops: Record<string, string>; upgrades: Record<string, string> } }) {
  const [selected, setSelected] = useState(farm.tabs[0]?.id ?? '');
  const tab = farm.tabs.find((t) => t.id === selected) ?? farm.tabs[0];
  if (!tab) return null;
  const busy = tab.tiles.filter((t) => t.state === 'growing' || t.state === 'ready').length;
  const ready = tab.tiles.filter((t) => t.state === 'ready').length;
  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-1">
        {farm.tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setSelected(t.id)}
            className={cn(
              'rounded border px-2 py-0.5 font-mono text-[10px] transition-colors',
              t.id === tab.id
                ? 'border-amber-800/60 bg-amber-950/40 text-amber-300'
                : 'border-zinc-800 bg-zinc-900/40 text-zinc-500 hover:text-zinc-300',
            )}
          >
            {TAB_LABELS[t.kind] ?? t.kind} · {t.tiles.length}
          </button>
        ))}
        <span className="ml-auto font-mono text-[10px] text-zinc-600">
          занято {busy}/{tab.tiles.length} · готово {ready}
        </span>
      </div>
      <div className="grid grid-cols-4 gap-1.5">
        {tab.tiles.map((t) => (
          <div
            key={`${tab.id}-${t.index}`}
            title={`тайл #${t.index} · ${t.state}${t.cropId ? ` · ${t.cropId}` : ''}`}
            className={cn('min-h-[64px] rounded-md border p-1.5', TILE_SKINS[t.state] ?? TILE_SKINS.empty)}
          >
            <div className="mb-0.5 flex items-center justify-between gap-1">
              <span className="font-mono text-[9px] text-zinc-600">#{t.index}</span>
              <span className="flex items-center gap-0.5">
                {t.fertilized && <span title="удобрен" className="text-[9px] text-amber-400">✦</span>}
                {t.weeds > 0 && (
                  <span title={`сорняки: стадия ${t.weeds}`} className="font-mono text-[9px] text-red-400">
                    ⚠{t.weeds}
                  </span>
                )}
              </span>
            </div>
            <p className="truncate text-[11px] leading-tight text-zinc-200">
              {t.cropId ? (names.crops[t.cropId] ?? t.cropId) : '—'}
            </p>
            <div className="mt-1">
              <TileBody t={t} now={farm.now} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function FarmTab() {
  const farm = useGameStore((s) => s.farm);
  if (!farm) return <EmptyHint>модуль фермы не активен</EmptyHint>;
  const names = farmNamesOf(getGame());
  return (
    <div>
      <CmdHint>витрина farm.state: FSM тайлов · полив/сухость · сорняки · качество сбора — ферма (M05)</CmdHint>
      {farm.upgrades.length > 0 ? (
        <>
          <Section title={`Улучшения (${farm.upgrades.length})`} />
          <div className="mb-2 flex flex-wrap gap-1">
            {farm.upgrades.map((u) => (
              <Pill key={u} tone="warn">{names.upgrades[u] ?? u}</Pill>
            ))}
          </div>
        </>
      ) : (
        <CmdHint>улучшений нет — farm.upgrades (вкладки ×3, спринклеры, компостер…)</CmdHint>
      )}
      <Section title="Вкладки и тайлы" />
      <FarmTiles farm={farm} names={names} />
      <p className="mt-3 text-[10px] leading-snug text-zinc-600">
        действия: farm plow/plant/water/fertilize/weed/harvest &lt;idx&gt; [tab] · каталог: farm.crops
      </p>
    </div>
  );
}
