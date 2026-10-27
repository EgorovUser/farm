'use client';

/**
 * Таблица инвентаря (M02): рюкзак + экипировка. Перенос из state-panel.tsx.
 */
import { useGameStore } from '@/stores/game-store';
import { EmptyHint } from '../panel';
import { CmdHint, Row } from './shared';

export function InventoryTab() {
  const stash = useGameStore((s) => s.stash);
  const equipped = useGameStore((s) => s.equipped);
  return (
    <div>
      <CmdHint>
        рюкзак (вкладки из данных, D17) · слоты {stash.length}/20 · команды: inv list / inv equip &lt;iid&gt; &lt;слот&gt;
      </CmdHint>
      {equipped.length > 0 && (
        <div className="mb-3">
          <p className="mb-1 text-[10px] text-zinc-600">экипировка (слоты из данных) — не занимает рюкзак</p>
          {equipped.map((e) => (
            <Row
              key={e.slot}
              label={`${e.slotName} · ${e.name} ×${e.qty}`}
              value={`${e.tier} ${e.value.toFixed(1)}${e.durability ? ` · ${e.durability}` : ''}${e.mods.length > 0 ? ` · ${e.mods.join(', ')}` : ''}${e.broken ? ' · СЛОМАН (ремонт — craft repair)' : ''}`}
              tone={e.broken ? 'text-red-400' : undefined}
            />
          ))}
        </div>
      )}
      {stash.length === 0 ? (
        <EmptyHint>инвентарь пуст — give turnip 5</EmptyHint>
      ) : (
        stash.map((s) => (
          <Row
            key={s.iid}
            label={`${s.name} (${s.defId})`}
            value={`×${s.qty}${s.tier !== '—' ? ` · ${s.tier} ${s.value.toFixed(1)}` : ''}`}
          />
        ))
      )}
    </div>
  );
}
