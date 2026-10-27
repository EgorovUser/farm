/**
 * Распил module.ts по wc-гигиене M13.2 (прецедент FIX-M12): монтаж доски
 * наёмников — кэш доски дня (детерминизм dailySeed, смена в полночь),
 * перепосчёт профилей нанятых (defId hpr_<дата>_<i> → доска дня найма) и
 * деп-набор api-помощников (доска/наём/увольнение — helpers-hire.ts).
 */
import type { EventBus } from '@/kernel/bus/event-bus/event-bus';
import type { StatBus } from '@/kernel/bus/stat-bus/stat-bus';
import type { TransactionService } from '@/kernel/services/transaction/transaction-service';
import type { TimeService } from '@/kernel/time/time-service';
import type { SaveDirector } from '@/kernel/save/save-director';
import type { ContentRegistry } from '@/kernel/content/content-registry';
import type { MineUpgradeDef } from '@/content/mine/upgrades';
import type { ModTypeDef } from '@/content/mods/registry';
import type { HelperClassDef, HelperFearDef, HelperProfile, MineHelpersTable } from '@/content/mine/helpers';
import { rollHelpersBoard } from './helpers-board';
import type { HelpersDeps } from './helpers-hire';
import type { MineModuleDeps } from './deps';
import type { MineState } from './state';

export interface HelpersMount {
  boardOf(dateISO: string): HelperProfile[];
  profileOf(defId: string): HelperProfile | null;
  helpersDeps: HelpersDeps;
}

/** монтаж доски наёмников (module.ts): кэш + профили + деп-набор api */
export function makeHelpersMount(args: {
  deps: MineModuleDeps;
  content: ContentRegistry;
  statBus: StatBus;
  time: TimeService;
  save: SaveDirector;
  transaction: TransactionService;
  bus: EventBus;
  upgradeDefs: MineUpgradeDef[];
  helperClasses: HelperClassDef[];
  helpersTable: MineHelpersTable;
  helperFears: HelperFearDef[];
  getState(): MineState;
  setState(s: MineState): void;
  markDirty(): void;
}): HelpersMount {
  const { deps, content, statBus, time, helperClasses, helpersTable, helperFears } = args;
  // форма/бюджет трейтов — ДАННЫЕ modforge (traitBudgets.helper: [1,3]/50%,
  // бюджет byRarity редкости — строки M03.3 C5; трейты — deps.rollTraits,
  // живой ривен-конструктор M03 по реестру, П4)
  const modforgeTable = content.get<{
    byRarity: Record<string, { budget: number }>;
    traitBudgets: { helper: { positives: [number, number]; negChance: number } };
  }>('modforge');
  let boardCache: { key: string; profiles: HelperProfile[] } | null = null;
  const boardOf = (dateISO: string): HelperProfile[] => {
    const saveId = deps.saveId();
    const key = `${saveId}:${dateISO}`;
    if (boardCache !== null && boardCache.key === key) return boardCache.profiles;
    const profiles = rollHelpersBoard(saveId, dateISO, {
      classes: helperClasses,
      table: helpersTable,
      fears: helperFears,
      rollTraits: deps.rollTraits,
      traitShape: () =>
        modforgeTable?.traitBudgets.helper ?? { positives: [1, 3] as [number, number], negChance: 0.5 },
      traitBudget: (rarity) => modforgeTable?.byRarity[rarity]?.budget ?? 10,
    });
    boardCache = { key, profiles };
    return profiles;
  };
  const profileOf = (defId: string): HelperProfile | null => {
    const day = /^hpr_(\d{4})(\d{2})(\d{2})_(\d+)$/.exec(defId);
    if (day === null) return null;
    return boardOf(`${day[1]}-${day[2]}-${day[3]}`)[Number(day[4])] ?? null;
  };
  const helpersDeps: HelpersDeps = {
    classes: helperClasses,
    table: helpersTable,
    fears: helperFears,
    upgradeDefs: args.upgradeDefs,
    saveId: () => deps.saveId(),
    today: () => time.localDateISO(time.now()),
    now: () => time.now(),
    boardOf,
    profileOf,
    resolveHelperStat: (stat, instanceId) =>
      statBus.resolve({
        stat,
        ctx: { ...time.ctx('player'), tags: ['mine', `helper:${instanceId}`] },
      }),
    getState: args.getState,
    setState: args.setState,
    markDirty: args.markDirty,
    transaction: args.transaction,
    bus: args.bus,
  };
  return { boardOf, profileOf, helpersDeps };
}

export type { ModTypeDef };
