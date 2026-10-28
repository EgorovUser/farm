/**
 * АЧИВКИ · быт (M15.2 §5): модфорж (рероллы + hidden «Терпение»), игрок
 * (уровень — playerLevel живёт в ачивках, N9; энергия), инвентарь (расход,
 * наборы предметов). КАЖДАЯ несёт unlockFlags. Числа — стартовые (тюнюется,
 * П6). Часть ACHIEVEMENTS (распил §4.8).
 * [M05.3 · G6] ферма: «Агроном» — 100 сборов (карточка M15 §5 «100 урожаев —
 * гейт солнечника»; [DECISION] счёт сборов, не единиц — буквеннее карточки).
 * [M06.1 · F4] загон: «Грибник» — 25 сборов грибницы (гейт Свиньи; вводится
 * M06 по праву касания — прецедент «Агроном» M05.3).
 */
import type { AchievementDef } from './types';

export const ACHIEVEMENTS_LIFE: AchievementDef[] = [
  // ------------------------------------------------------------ модфорж (modforge)
  {
    id: 'ach_reroll_gourmet',
    name: 'Реролл-гурман',
    condition: { t: 'counterAtLeast', counter: 'modforge.rerolls', value: 10 },
    rewards: [{ t: 'xp', qty: 80 }], // тюнюется
    unlockFlags: ['ach.modforge.rerolls'], // гейт ассортимента M04 (фикстура «Монета перерождений»)
  },
  {
    id: 'ach_rivens_alchemist',
    name: 'Алхимик ривенов',
    condition: { t: 'counterAtLeast', counter: 'modforge.rerolls', value: 50 },
    rewards: [
      { t: 'currency', id: 'gold', qty: 350 }, // тюнюется
      { t: 'xp', qty: 200 }, // тюнюется
    ],
    unlockFlags: ['ach.modforge.alchemist'],
  },
  {
    id: 'ach_patience',
    name: 'Терпение',
    hidden: true, // пасхалка: 100 рероллов — путь мастера долог
    condition: { t: 'counterAtLeast', counter: 'modforge.rerolls', value: 100 },
    rewards: [{ t: 'passivePoint', qty: 1 }], // слушатель M14 (фаза 4)
    unlockFlags: ['ach.modforge.patience'],
  },
  // ------------------------------------------------------------ игрок (уровень/энергия)
  {
    id: 'ach_growing_up',
    name: 'Крепнущий хозяин',
    condition: { t: 'playerLevel', level: 5 },
    rewards: [{ t: 'xp', qty: 30 }], // тюнюется
    unlockFlags: ['player.level5'],
  },
  {
    id: 'ach_mature_master',
    name: 'Зрелый мастер',
    condition: { t: 'playerLevel', level: 10 },
    rewards: [{ t: 'currency', id: 'gold', qty: 200 }], // тюнюется
    unlockFlags: ['player.level10'],
  },
  {
    id: 'ach_homestead_glory',
    name: 'Слава хутора',
    condition: { t: 'playerLevel', level: 20 },
    rewards: [
      { t: 'currency', id: 'gold', qty: 600 }, // тюнюется
      { t: 'item', defId: 'lucky_charm', qty: 1 }, // тюнюется
    ],
    unlockFlags: ['player.level20'],
  },
  {
    id: 'ach_valley_legend',
    name: 'Легенда долины',
    condition: { t: 'playerLevel', level: 30 },
    rewards: [
      { t: 'passivePoint', qty: 1 }, // слушатель M14 (фаза 4)
      { t: 'item', defId: 'ancient_idol', qty: 1 }, // тюнюется (крупная)
    ],
    unlockFlags: ['player.level30'],
  },
  {
    id: 'ach_homestead_master',
    name: 'Мастер хутора',
    // [M16.1 · ветка (б) DECISION M161-гейт] РОВНО ОДНА новая ачивка:
    // пул 61 → 62 (открыто в M16.1-REPORT/worklog); unlockFlag — гейт
    // открытия деревни (уровень 30 + ЭТА ачивка); БЕЗ passivePoint — очки
    // пассивок НЕ растут (канон M14/points.ts не трогается). Семантика:
    // разносторонний хозяин — уровневый рост + урожаи + рыбалка.
    condition: {
      t: 'all',
      cs: [
        { t: 'playerLevel', level: 25 },
        { t: 'counterAtLeast', counter: 'farm.harvest.batches', value: 50 },
        { t: 'counterAtLeast', counter: 'fish.total', value: 30 },
      ],
    },
    rewards: [{ t: 'currency', id: 'gold', qty: 800 }], // тюнюется
    unlockFlags: ['village.homestead.master'],
  },
  {
    id: 'ach_hard_worker',
    name: 'Трудяга',
    condition: { t: 'counterAtLeast', counter: 'player.energy.spent', value: 1000 },
    rewards: [
      { t: 'currency', id: 'gold', qty: 200 }, // тюнюется
      { t: 'item', defId: 'energy_tonic', qty: 3 }, // тюнюется
    ],
    unlockFlags: ['player.hardworker'],
  },
  {
    id: 'ach_tireless',
    name: 'Неутомимый',
    condition: { t: 'counterAtLeast', counter: 'player.energy.spent', value: 5000 },
    rewards: [
      { t: 'passivePoint', qty: 1 }, // слушатель M14 (фаза 4)
      { t: 'xp', qty: 350 }, // тюнюется
    ],
    unlockFlags: ['player.tireless'],
  },
  // ------------------------------------------------------------ инвентарь (расход/предметы)
  {
    id: 'ach_simple_tastes',
    name: 'Неприхотливый',
    condition: { t: 'counterAtLeast', counter: 'consume.items', value: 100 },
    rewards: [{ t: 'currency', id: 'gold', qty: 150 }], // тюнюется
    unlockFlags: ['ach.consume.simple'],
  },
  {
    id: 'ach_gourmet_life',
    name: 'Живу со вкусом',
    condition: { t: 'counterAtLeast', counter: 'consume.items', value: 500 },
    rewards: [
      { t: 'currency', id: 'gold', qty: 500 }, // тюнюется
      { t: 'item', defId: 'hearty_stew', qty: 3 }, // тюнюется
    ],
    unlockFlags: ['ach.consume.gourmet'],
  },
  {
    id: 'ach_potion_collection',
    name: 'Зельевар',
    condition: {
      t: 'all',
      cs: [
        { t: 'hasItem', defId: 'growth_elixir', qty: 1 },
        { t: 'hasItem', defId: 'luck_elixir', qty: 1 },
        { t: 'hasItem', defId: 'battle_draught', qty: 1 },
      ],
    },
    rewards: [
      { t: 'currency', id: 'gold', qty: 300 }, // тюнюется
      { t: 'xp', qty: 150 }, // тюнюется
    ],
    unlockFlags: ['ach.items.potions'],
  },
  // ------------------------------------------------------------ ферма (M05.3 · G6)
  {
    id: 'ach_agronomist',
    name: 'Агроном',
    condition: { t: 'counterAtLeast', counter: 'farm.harvest.batches', value: 100 },
    rewards: [
      { t: 'currency', id: 'gold', qty: 500 }, // тюнюется
      { t: 'xp', qty: 300 }, // тюнюется
    ],
    // гейт солнечника (карточка M05 §2: «уровень 25 + ачивка «Агроном»»)
    unlockFlags: ['ach.farm.agronomist'],
  },
  // ------------------------------------------------------------ загон (M06.1 · F4)
  {
    id: 'ach_mycologist',
    name: 'Грибник',
    condition: { t: 'counterAtLeast', counter: 'farm.mushroom.harvests', value: 25 },
    rewards: [
      { t: 'currency', id: 'gold', qty: 200 }, // стартовое предложение брифа F4 (тюнинг)
      { t: 'xp', qty: 100 }, // стартовое предложение брифа F4 (тюнинг)
    ],
    // гейт Свиньи (карточка M06 §2: «Свинья … ачивка ach_mycologist»);
    // цикл разомкнут: «Грибник» достижим грибницей M05.3 (грибы — культура
    // фермы), Свинья не нужна для своей же ачивки
    unlockFlags: ['ach.farm.mycologist'],
  },
  // ------------------------------------------------------------ рыбалка (M07.2 · F15)
  {
    // счётная: 100 рыб (счётчик fish.total жив с фазы 0 — НЕ пересоздавался);
    // награды [DECISION брифа F15: золото 500 + XP 100]
    id: 'ach_fisherman',
    name: 'Рыбак',
    condition: { t: 'counterAtLeast', counter: 'fish.total', value: 100 },
    rewards: [
      { t: 'currency', id: 'gold', qty: 500 },
      { t: 'xp', qty: 100 },
    ],
    unlockFlags: ['ach.fishing.fisherman'],
  },
  {
    // коллекционная полнота пруда: все 7 видов ≥ 1 (включая Золотого карпа —
    // достижимо в M07.2); счётчики fish.<fishId> введены этим сеансом (F15)
    id: 'ach_pond_master',
    name: 'Хозяин пруда',
    condition: {
      t: 'all',
      cs: [
        { t: 'counterAtLeast', counter: 'fish.crucian', value: 1 },
        { t: 'counterAtLeast', counter: 'fish.rotan', value: 1 },
        { t: 'counterAtLeast', counter: 'fish.perch', value: 1 },
        { t: 'counterAtLeast', counter: 'fish.tench', value: 1 },
        { t: 'counterAtLeast', counter: 'fish.pike', value: 1 },
        { t: 'counterAtLeast', counter: 'fish.mirror_carp', value: 1 },
        { t: 'counterAtLeast', counter: 'fish.golden_carp', value: 1 },
      ],
    },
    rewards: [
      { t: 'currency', id: 'gold', qty: 300 }, // тюнюется
      { t: 'xp', qty: 150 }, // тюнюется
    ],
    unlockFlags: ['ach.fishing.pond_master'],
  },
  {
    // коллекционная полнота реки: все 9 видов ≥ 1 — НЕ достижимо до M08/M12
    // (Ледяная нерка/Древний сом — заглушки-замки гейт-рыб F11); задел по
    // прецеденту альпаки F3(а) M06.1
    id: 'ach_river_master',
    name: 'Хозяин реки',
    condition: {
      t: 'all',
      cs: [
        { t: 'counterAtLeast', counter: 'fish.loach', value: 1 },
        { t: 'counterAtLeast', counter: 'fish.dace', value: 1 },
        { t: 'counterAtLeast', counter: 'fish.gudgeon', value: 1 },
        { t: 'counterAtLeast', counter: 'fish.chub', value: 1 },
        { t: 'counterAtLeast', counter: 'fish.zander', value: 1 },
        { t: 'counterAtLeast', counter: 'fish.trout', value: 1 },
        { t: 'counterAtLeast', counter: 'fish.sturgeon', value: 1 },
        { t: 'counterAtLeast', counter: 'fish.ice_char', value: 1 },
        { t: 'counterAtLeast', counter: 'fish.ancient_som', value: 1 },
      ],
    },
    rewards: [
      { t: 'currency', id: 'gold', qty: 600 }, // тюнюется
      { t: 'xp', qty: 250 }, // тюнюется
    ],
    unlockFlags: ['ach.fishing.river_master'],
  },
  // ------------------------------------------------------------ озеро (M08.2 · F15)
  {
    // вывод в озере: рыба тира A+ (A ИЛИ выше — [DECISION-чтение «A+»
    // карточки M08 §6 / M15 §5]; счётчики lake.bred.a/s/ss введены этим
    // сеансом — событийные, любое озеро тикает); открывает Ледяную нерку
    // (гейт-рыба M07.2 F11: achievement ach_lake_master — живой гейт-оценщик
    // читает выданные ачивки, кода рыбалки НЕ требует);
    // награды [DECISION брифа F15: золото 800 + XP 150]
    id: 'ach_lake_master',
    name: 'Хозяин озера',
    condition: {
      t: 'any',
      cs: [
        { t: 'counterAtLeast', counter: 'lake.bred.a', value: 1 },
        { t: 'counterAtLeast', counter: 'lake.bred.s', value: 1 },
        { t: 'counterAtLeast', counter: 'lake.bred.ss', value: 1 },
      ],
    },
    rewards: [
      { t: 'currency', id: 'gold', qty: 800 },
      { t: 'xp', qty: 150 },
    ],
    unlockFlags: ['ach.lake.master'],
  },
];
