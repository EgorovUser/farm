/**
 * УЛУЧШЕНИЯ ЗАГОНА (карточка M06 §5; бриф M06.2 F3) — данные + TransactionService
 * (паттерн фермы M05.3: улучшение = данные, покупка = eventId 'pen.upgrade',
 * БЕЗ энергии — прецедент farm.upgrade; НЕ товары M04 — пул 60 жив, прецедент
 * гербицидов).
 *
 * Поимённо (цены — стартовые предложения [DECISION], тюнинг заказчика):
 *   Амбар 600з — +4 слота/уровень, до 3 уровней (повторная покупка уровня;
 *   [DECISION] расширяет ОБА загона — постройка двора, не одного стада);
 *   Автокормушки 1200з — [DECISION]-гибрид по прецеденту спринклеров:
 *     исполнитель pen.autofeeder регистрацией покупкой + runTask при наличии
 *     Корма + восстановление due-проходом (часовая ветка — будильник дня);
 *   «Тёплый загон» 800з — эффект warm: шанс болезни ×0.5 (−50%), decay
 *     сытости ×0.9 (−22.5/день; «+10% аппетит» — [DECISION-расшифровка]);
 *     применяется к ИТОГОВОМУ шансу (база + уход-штрафы) — мод-фактор данных;
 *   «Родильный загон» 1500з — открывает разведение (pen.breed, карточка §4);
 *   «Пастбище-люкс» 2500з — мод flat +10 на стат pen.happiness.bonus
 *     ([DECISION-форма: flat к капу 100] — эффективное счастье
 *     min(100, raw + бонус), провайдер penUpgradesProvider, тег 'pen');
 *   «Второй загон» 2000з — pen.animals2 со своими 4 слотами (адресация
 *     care/collect параметром загона; свой работник — M11);
 *   «Симбиоз» 500з — автосбор навоза dayTick → Удобрение по живому курсу
 *     компостера фермы (чтение ДАННЫХ M05 'farm.upgrades' через реестр,
 *     вызовов фермы НЕТ; прецедент farm.compost — событийный обмен).
 */
import type { ID } from '@/shared/types/ids';
import type { Condition } from '@/shared/types/requirement';
import type { StatId } from '@/shared/types/ids';

/** форма мода улучшения (локальная копия — изоляция контента: pen не импортирует
 *  контент фермы; прецедент factorOfScore — своя копия преобразования) */
export interface PenUpgradeMod {
  stat: StatId;
  op: 'flat' | 'inc' | 'more' | 'override' | 'cap';
  value: number;
  tag: string;
  label: string;
}

/** эффекты улучшений загона (дискриминированный юнион — паттерн фермы) */
export type PenUpgradeEffect =
  | { t: 'slots'; addPerLevel: number; maxLevels: number }
  | { t: 'autofeeder' }
  | { t: 'warm'; sickFactor: number; appetiteFactor: number }
  | { t: 'breeding' }
  | { t: 'mods'; mods: PenUpgradeMod[] }
  | { t: 'pen2' }
  | { t: 'symbiosis' };

export interface PenUpgradeDef {
  id: ID;
  name: string;
  description: string;
  cost: { currency: 'gold'; qty: number };
  unlock?: Condition;
  effect: PenUpgradeEffect;
}

export const PEN_UPGRADES: PenUpgradeDef[] = [
  {
    id: 'upg_barn',
    name: 'Амбар',
    description: '+4 слота загона за уровень (до 3 уровней); расширяет оба загона',
    cost: { currency: 'gold', qty: 600 },
    effect: { t: 'slots', addPerLevel: 4, maxLevels: 3 },
  },
  {
    id: 'upg_autofeeder',
    name: 'Автокормушки',
    description: 'Кормят всех голодных раз в день, пока есть Корм (исполнитель pen.autofeeder)',
    cost: { currency: 'gold', qty: 1200 },
    effect: { t: 'autofeeder' },
  },
  {
    id: 'upg_warm_pen',
    name: 'Тёплый загон',
    description: 'Шанс болезни −50%, аппетит +10% (decay сытости ×0.9)',
    cost: { currency: 'gold', qty: 800 },
    effect: { t: 'warm', sickFactor: 0.5, appetiteFactor: 0.9 },
  },
  {
    id: 'upg_breeding_pen',
    name: 'Родильный загон',
    description: 'Открывает разведение: pen.breed <idx1> <idx2> (потомство через 48 ч)',
    cost: { currency: 'gold', qty: 1500 },
    effect: { t: 'breeding' },
  },
  {
    id: 'upg_lux_pasture',
    name: 'Пастбище-люкс',
    description: '+10 счастья всем животным (к капу 100)',
    cost: { currency: 'gold', qty: 2500 },
    effect: {
      t: 'mods',
      mods: [{ stat: 'pen.happiness.bonus', op: 'flat', value: 10, tag: 'pen', label: 'пастбище-люкс: +10 счастья' }],
    },
  },
  {
    id: 'upg_second_pen',
    name: 'Второй загон',
    description: 'Копия загона: свои 4 слота, адресация уход/сбор параметром загона',
    cost: { currency: 'gold', qty: 2000 },
    effect: { t: 'pen2' },
  },
  {
    id: 'upg_symbiosis',
    name: 'Симбиоз',
    description: 'Навоз → Удобрение фермы автоматически раз в день (курс компостера)',
    cost: { currency: 'gold', qty: 500 },
    effect: { t: 'symbiosis' },
  },
];
