/**
 * РЕЕСТР ТИПОВ РИВЕН-ХАРАКТЕРИСТИК (03-DATA §5, M03 §2).
 * Контент-минимум M02.2 (3 строки) расширен до 6 в сеансе M03.1: движку нужны
 * скоупы с ≥2 кандидатами (multi-baff роллы редких+), tool-скоуп для канона
 * заказчика («кирка common → бюджет 10»), заряд card:forge/worker/helper —
 * строками контента БЕЗ кода (П1/П5) в модулях-потребителях M10/M11/M13.
 *
 * costWeight = стоимость МАКСИМАЛЬНОГО бафа типа (масштаб бюджетов §4:
 * common 10 … legendary 60): weight 10 = один max-баф съедает common-бюджет.
 * Значения — стартовые, ТЮНЮЕМЫЕ (П6): правятся здесь без миграций.
 *
 * stat указывает ТОЛЬКО на существующие базы (content/balance/bases.ts +
 * domain-таблицы; инвариант самопроверяется группой M03 self-checks).
 * Генерация/бюджеты/кривые/рероллы — движок modules/modforge (M03).
 */
import type { ID, StatId, Tag } from '@/shared/types/ids';

export interface ModTypeDef {
  id: ID;
  /** на какую шину ложится (D31: rolledMods → inc по этому стату) */
  stat: StatId;
  /** к каким категориям предметов применим (теги modSlots предмета) */
  scopeTags: Tag[];
  maxPositive: number;
  maxNegative: number;
  /** вес в бюджете = стоимость max-бафа (M03) */
  costWeight: number;
  /** форма стоимости между min и max (M03) */
  curve?: 'linear' | 'soft' | 'steep';
}

export const MOD_TYPES: ModTypeDef[] = [
  {
    id: 'atk_power',
    stat: 'combat.attack',
    scopeTags: ['weapon', 'melee'],
    maxPositive: 30,
    maxNegative: -10,
    costWeight: 10,
    curve: 'linear',
  },
  {
    // [M03.1] второй кандидат weapon/melee-скоупа: редкие+ роллят 2+ РАЗНЫХ
    // бафа (§5 шаг 3) — с одним типом это невозможно
    id: 'atk_finesse',
    stat: 'combat.attack',
    scopeTags: ['weapon', 'melee'],
    maxPositive: 15,
    maxNegative: -6,
    costWeight: 12,
    curve: 'soft',
  },
  {
    id: 'def_power',
    stat: 'combat.defense',
    scopeTags: ['armor', 'shield'],
    maxPositive: 20,
    maxNegative: -8,
    costWeight: 10,
    curve: 'linear',
  },
  {
    // [FIX-RIVEN · FX2 · DECISION] ВЫВОД из пула живых роллов — по данным
    // этого реестра: единственный щит (buckler) НЕ имеет modSlots (прецедент
    // «БЕЗ ривен-слотов»), скоуп 'shield' не запрашивается роллами — строка
    // не роллится в живой генерации. Чутьё щита в M12 — тир-формула
    // (MINE_TABLE.block.sensePerTier), НЕ combat.block (замок M12 брифа
    // FIX-RIVEN §4). Плоская семантика НЕ выбрана: пред-база щита 4 ≠ 0 —
    // стат-драйвенное правило FX1 даёт inc (4 × 1.12 = 4.48 → 4), плоская
    // потребовала бы хардкода имени строки (запрещён FX1). Строка сохранена
    // как данные канала combat.block для будущих тиров щитов со слотами.
    id: 'block_sense',
    stat: 'combat.block',
    scopeTags: ['shield'],
    maxPositive: 12,
    maxNegative: 0,
    costWeight: 9,
    curve: 'linear',
  },
  {
    id: 'lucky_glow',
    stat: 'fishing.luck.rare',
    scopeTags: ['rod'],
    maxPositive: 15,
    maxNegative: 0,
    costWeight: 12,
    curve: 'soft',
  },
  {
    // [M03.1] tool-скоуп: канон заказчика «покупаем кирку common → бюджет 10»
    id: 'mine_sense',
    stat: 'mine.luck.hidden',
    scopeTags: ['tool', 'pickaxe'],
    maxPositive: 20,
    maxNegative: -5,
    costWeight: 10,
    curve: 'steep',
  },
  {
    // [M04.1 · C3] второй кандидат tool/pickaxe-скоупа: в пуле магазина
    // появляется steel_pickaxe (rare, [2,2]) — инвариант достаточности
    // candidates ≥ maxPos требует ≥2 кандидатов (AUDIT-M03 C3)
    id: 'mine_instinct',
    stat: 'mine.luck.hidden',
    scopeTags: ['tool', 'pickaxe'],
    maxPositive: 10,
    maxNegative: -4,
    costWeight: 8,
    curve: 'linear',
  },
  {
    // [M04.1 · C3] третий кандидат weapon/melee: dragon_fang (legendary, [3,3])
    // требует ≥3 кандидатов; тот же стат combat.attack — прецедент atk_power/atk_finesse
    id: 'atk_mastery',
    stat: 'combat.attack',
    scopeTags: ['weapon', 'melee'],
    maxPositive: 20,
    maxNegative: -8,
    costWeight: 14,
    curve: 'steep',
  },
  {
    // [M04.1 · C3] второй кандидат armor-скоупа: knight_armor (rare, [2,2])
    id: 'def_mastery',
    stat: 'combat.defense',
    scopeTags: ['armor'],
    maxPositive: 15,
    maxNegative: -6,
    costWeight: 11,
    curve: 'soft',
  },
  // --- [M10.2] карточки заточки (карточка M10 §5): скоуп card:forge —
  // вызывается rollFor с тегом card:forge при levelUp; стартовые роллы
  // предметов (modSlots.tags: weapon/tool/…) этих модов НЕ видят (П1/П5).
  // Двуполярные (дебаф-карточки — ривен-модель M03: negChance формы byRarity
  // даёт отрицательные роллы) + особые свойства (данные, карточка §5).
  {
    id: 'might_card',
    stat: 'combat.attack',
    scopeTags: ['card:forge'],
    maxPositive: 12,
    maxNegative: -6,
    costWeight: 8,
    curve: 'linear',
  },
  {
    id: 'guard_card',
    stat: 'combat.defense',
    scopeTags: ['card:forge'],
    maxPositive: 10,
    maxNegative: -5,
    costWeight: 8,
    curve: 'linear',
  },
  {
    // особое свойство: «Вещий удар» — 20% увидеть направление атаки врага
    // (M12 читает как stat; карточка §5 «строки реестра со спец-тегами»)
    id: 'prophetic_strike',
    stat: 'combat.prophetic',
    scopeTags: ['card:forge', 'special'],
    maxPositive: 20,
    maxNegative: 0,
    costWeight: 14,
    curve: 'steep',
  },
  {
    // особое свойство: «Рудное чутьё»
    id: 'ore_sense',
    stat: 'mine.oreSense',
    scopeTags: ['card:forge', 'special'],
    maxPositive: 15,
    maxNegative: 0,
    costWeight: 12,
    curve: 'soft',
  },
  {
    // особое свойство: «Кровопийца»
    id: 'vampiric',
    stat: 'combat.lifesteal',
    scopeTags: ['card:forge', 'special'],
    maxPositive: 10,
    maxNegative: 0,
    costWeight: 12,
    curve: 'soft',
  },
  // --- [M07.1] rod-скоуп: лестница удочек ×6 (F4) — ривен-роллы при покупке
  //     fish.buy (журнал fish:rod:<defId>); инвариант C3 AUDIT-M03:
  //     candidates(rod) ≥ maxPos редкостей лестницы (common [1,1] …
  //     legendary [3,3] — с lucky_glow + 4 новыми = 5 кандидатов)
  {
    // карточка M03 §2 «treasureBias | fishing.treasure.weight | rod | ×4»:
    // +300 = вес сокровищ ×4 (крутая кривая — максимум дорог)
    id: 'treasure_sense',
    stat: 'fishing.treasure.weight',
    scopeTags: ['rod'],
    maxPositive: 300,
    maxNegative: 0,
    costWeight: 14,
    curve: 'steep',
  },
  {
    // второй кандидат rod-скоупа (редкости uncommon [1,2]) — тот же стат,
    // что lucky_glow (прецедент atk_power/atk_finesse)
    id: 'rod_mastery',
    stat: 'fishing.luck.rare',
    scopeTags: ['rod'],
    maxPositive: 10,
    maxNegative: -5,
    costWeight: 10,
    curve: 'soft',
  },
  {
    // рывок веса rare в ролле редкости (вес — база fishing.weight.rare)
    id: 'rare_pull',
    stat: 'fishing.weight.rare',
    scopeTags: ['rod'],
    maxPositive: 40,
    maxNegative: -20,
    costWeight: 11,
    curve: 'soft',
  },
  {
    // рывок веса epic в ролле редкости (вес — база fishing.weight.epic)
    id: 'epic_pull',
    stat: 'fishing.weight.epic',
    scopeTags: ['rod'],
    maxPositive: 50,
    maxNegative: -25,
    costWeight: 13,
    curve: 'steep',
  },
];
