/**
 * УЛУЧШЕНИЯ ФЕРМЫ (карточка M05 §6 + §2; G1/G2 брифа M05.3).
 *
 * Единая конвейерная точка покупок: вкладки («Грибница»/«Виноградник»/
 * «Теплица»/«Второе поле») и эффектные улучшения — ОДНИ данными, покупка =
 * действие farm.upgrade (TransactionService, золото; гейты уровня — unlock).
 * «Улучшение = данные + вызов TransactionService; код не трогается» (§6).
 *
 * Эффекты — типизированный union (zod: content/farm/schemas.ts):
 *   openTab   — открывает вкладку (kind из 03-DATA §6; тайлы свои); скорость
 *               speedPercent = бонус скорости на вкладке (мод с тегом
 *               farm:tab:<kind> — провайдер M05.3);
 *   mods      — статовые моды (Плодородие/Чернозём/Гербициды): значения
 *               применяет farmUpgradesProvider, код их не знает;
 *   sprinkler — автополив раз в 8 ч (TaskRegistry-исполнитель + часовой
 *               каденс из данных — [DECISION · G2]);
 *   composter — прополка с навозом → Удобрение (транзакция обмена;
 *               [DECISION · G2] семантика);
 *   tierBonus — +1 тир качества сборов вкладки («Парник-люкс», G4).
 *
 * Числа — стартовые (тюнинг заказчика, П6): цены/гейты вкладок — предложения
 * брифа M05.3 G1 (400з/ур.8 · 900з/ур.15 · 2000з/ур.20); эффектные — выбор
 * сеанса ([DECISION], отмечен в отчёте).
 */
import type { ID } from '@/shared/types/ids';
import type { CurrencyId } from '@/shared/types/ids';
import type { Condition } from '@/shared/types/requirement';
import type { Op } from '@/shared/types/ids';
import type { FarmTabKind } from '@/game/modules/farm/state';

export interface FarmUpgradeModDef {
  stat: string;
  op: Op;
  value: number;
  /** контекст-тег мода (все теги должны быть в ctx резолва — 02-BUSES §2) */
  tag: string;
  label: string;
}

export type FarmUpgradeEffect =
  | { t: 'openTab'; tabId: ID; kind: FarmTabKind; tiles: number; speedPercent?: number }
  | { t: 'mods'; mods: FarmUpgradeModDef[] }
  | { t: 'sprinkler'; intervalHours: number }
  | { t: 'composter'; input: { item: ID; qty: number }; output: { currency: CurrencyId; qty: number } }
  | { t: 'tierBonus'; tabKind: FarmTabKind };

export interface FarmUpgradeDef {
  id: ID;
  name: string;
  description: string;
  /** цена покупки (TransactionService; золото) */
  cost: { currency: CurrencyId; qty: number };
  /** гейт покупки (обычно уровень игрока) */
  unlock: Condition;
  effect: FarmUpgradeEffect;
}

export const FARM_UPGRADES: FarmUpgradeDef[] = [
  // ------------------------------------------------------------ вкладки (карточка §2)
  {
    id: 'tab_mushroom',
    name: 'Грибница',
    description: 'Тёмные гряды для грибов: +8 тайлов, культура «Грибы»',
    cost: { currency: 'gold', qty: 400 },
    unlock: { t: 'playerLevel', level: 8 },
    effect: { t: 'openTab', tabId: 'mushroom', kind: 'mushroom', tiles: 8 },
  },
  {
    id: 'tab_vineyard',
    name: 'Виноградник',
    description: 'Шпалеры под лозу: +8 тайлов, культура «Виноград»',
    cost: { currency: 'gold', qty: 900 },
    unlock: { t: 'playerLevel', level: 15 },
    effect: { t: 'openTab', tabId: 'vineyard', kind: 'vineyard', tiles: 8 },
  },
  {
    id: 'tab_greenhouse',
    name: 'Теплица',
    description: 'Стеклянный кров: +8 тайлов, без сорняков, +20% скорости',
    cost: { currency: 'gold', qty: 2000 },
    unlock: { t: 'playerLevel', level: 20 },
    effect: { t: 'openTab', tabId: 'greenhouse', kind: 'greenhouse', tiles: 8, speedPercent: 20 },
  },
  // ------------------------------------------------------------ улучшения (карточка §6)
  {
    id: 'upg_herbicides',
    name: 'Гербициды',
    description: 'Гербицидная обработка: шанс зарастания −50%',
    cost: { currency: 'gold', qty: 300 },
    unlock: { t: 'playerLevel', level: 6 },
    effect: {
      t: 'mods',
      mods: [
        // значение = FARM_TABLE.weeds.herbicideReductionPercent (правило §4:
        // inc −50 к шансу мультипликативно: 8% × 0.5 = 4%; мод-путь жив с M05.2)
        { stat: 'farm.weeds.chancePercent', op: 'inc', value: -50, tag: 'farm', label: 'гербициды: −50% к шансу сорняков' },
      ],
    },
  },
  {
    id: 'upg_fertility',
    name: 'Плодородие',
    description: 'Питательный слой: плодовые +25% скорости, корнеплоды −10%',
    cost: { currency: 'gold', qty: 600 },
    unlock: { t: 'playerLevel', level: 10 },
    effect: {
      t: 'mods',
      mods: [
        { stat: 'farm.growthSpeed', op: 'inc', value: 25, tag: 'farm:crop:fruit', label: 'плодородие: плодовые +25%' },
        { stat: 'farm.growthSpeed', op: 'inc', value: -10, tag: 'farm:crop:root', label: 'плодородие: корнеплоды −10%' },
      ],
    },
  },
  {
    id: 'upg_chernozem',
    name: 'Тёмный чернозём',
    description: 'Грибная земля: грибы +30% скорости, плодовые −15%',
    cost: { currency: 'gold', qty: 800 },
    unlock: { t: 'playerLevel', level: 12 },
    effect: {
      t: 'mods',
      mods: [
        { stat: 'farm.growthSpeed', op: 'inc', value: 30, tag: 'farm:crop:mushroom', label: 'чернозём: грибы +30%' },
        { stat: 'farm.growthSpeed', op: 'inc', value: -15, tag: 'farm:crop:fruit', label: 'чернозём: плодовые −15%' },
      ],
    },
  },
  {
    id: 'upg_composter',
    name: 'Компостер',
    description: 'Сорняки + навоз → Удобрение при прополке',
    cost: { currency: 'gold', qty: 500 },
    unlock: { t: 'playerLevel', level: 10 },
    effect: { t: 'composter', input: { item: 'manure', qty: 1 }, output: { currency: 'fertilizer', qty: 1 } },
  },
  {
    id: 'upg_sprinklers',
    name: 'Спринклеры',
    description: 'Автополив всех растущих раз в 8 ч (исполнитель farm.sprinkler)',
    cost: { currency: 'gold', qty: 1200 },
    unlock: { t: 'playerLevel', level: 14 },
    effect: { t: 'sprinkler', intervalHours: 8 },
  },
  {
    id: 'upg_field2',
    name: 'Второе поле',
    description: 'Копия «Поля» 4×4 (+16 тайлов); требует своего работника (M11)',
    cost: { currency: 'gold', qty: 1500 },
    unlock: { t: 'playerLevel', level: 16 },
    effect: { t: 'openTab', tabId: 'field2', kind: 'field', tiles: 16 },
  },
  {
    id: 'upg_greenhouse_lux',
    name: 'Парник-люкс',
    description: 'Стекло и пар: сборы в «Теплице» на 1 тир качества выше',
    cost: { currency: 'gold', qty: 2500 },
    unlock: { t: 'playerLevel', level: 22 },
    effect: { t: 'tierBonus', tabKind: 'greenhouse' },
  },
];
