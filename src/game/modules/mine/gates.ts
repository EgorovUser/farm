/**
 * Гейты слоёв M12.2 (G3, распил module.ts по wc-гигиене, прецедент b4af909):
 * оценщик Requirement (прецедент shop.purchase gateCtx — свой statBus/time +
 * app-шов extras), слой по данным, двойной гейт (кирка экипирована + тир +
 * ачивка предыдущего слоя). Числа — content/mine/layers.ts (П6).
 */
import type { StatBus } from '@/kernel/bus/stat-bus/stat-bus';
import type { TimeService } from '@/kernel/time/time-service';
import type { ConditionCtx, Requirement } from '@/shared/types/requirement';
import type { Result } from '@/shared/types/result';
import { err, ok } from '@/shared/types/result';
import { checkCondition } from '@/shared/utils/condition-check';
import type { MineLayerDef } from '@/content/mine/layers';
import type { MineModuleDeps, PickaxeView } from './deps';

/** оценщик Requirement: свой statBus/time + app-шов extras (флаги/ачивки M15,
 *  уровень/навыки M01) + itemCount M02 (прецедент shop.purchase gateCtx) */
export function createEvaluate(
  deps: MineModuleDeps,
  statBus: StatBus,
  time: TimeService,
): (req: Requirement) => boolean {
  return (req) => {
    const extra = deps.gateExtras();
    const ctx: ConditionCtx = {
      tags: [],
      stat: (stat) => statBus.resolve({ stat, ctx: { ...time.ctx('player'), extra } }),
      hasFlag: (flag) => Boolean(extra[`flag:${flag}`]),
      skillLevel: (skill) => Number(extra[`skill:${skill}`] ?? 0),
      playerLevel: Number(extra['player:level'] ?? 0),
      itemCount: (defId) => deps.itemCount(defId),
      hasAchievement: (id) => Boolean(extra[`achievement:${id}`]),
    };
    return checkCondition(req, ctx);
  };
}

/** слой по данным (1..N); бой/вход вне данных — честный отказ.
 *  Дефолт/некоррект — слой 1 (семантика M12.1: Math.max(1, floor(n||1))) */
export function createLayerOf(
  layers: MineLayerDef[],
): (raw: unknown) => Result<MineLayerDef> {
  return (raw) => {
    const n = Math.max(1, Math.floor(Number(raw) || 1));
    const def = layers.find((l) => l.layer === n);
    if (def === undefined) {
      return err(`слой ${n} вне данных шахты (слои 1–${layers.length})`);
    }
    return ok(def);
  };
}

/** двойной гейт слоя G3: кирка экипирована + тир + ачивка предыдущего слоя */
export function createLayerGate(
  deps: MineModuleDeps,
  evaluate: (req: Requirement) => boolean,
): (def: MineLayerDef) => Result<{ pick: PickaxeView }> {
  return (def) => {
    const pick = deps.pickaxeView();
    if (!pick.hasPickaxe) {
      return err(`слой ${def.layer}: нужна кирка — экипируйте её в слот «Кирка» (M02)`);
    }
    if (pick.tier < def.pickGate.minTier) {
      return err(
        `слой ${def.layer}: нужна ${def.pickGate.label} (тир ${def.pickGate.minTier}+) — тир кирки сейчас ${pick.tier}` +
          ` (${pick.quality ?? '?'} + заточка ${pick.forgeLevel}/10)`,
      );
    }
    if (def.unlock !== undefined && !evaluate(def.unlock)) {
      const u = def.unlock as { t: string; id?: string };
      return err(
        `слой ${def.layer}: нужна ачивка слоя ${def.layer - 1}${u.id !== undefined ? ` (${u.id})` : ''} — победите над боссом предыдущего слоя`,
      );
    }
    return ok({ pick });
  };
}
