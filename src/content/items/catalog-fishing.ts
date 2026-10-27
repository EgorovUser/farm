/**
 * Каталог: рыбы, мусор, наживки, удочки M07 (03-DATA §4; F7 брифа — дефы
 * аддитивно, пул M04 НЕ тронут). Червяк (worm_bait) жил с фазы 2 в
 * catalog-shelves — здесь НЕ дублируется (сверка F5 по ContentRegistry).
 *
 * Статы шаблона удочек (карточка §4) = baseStats: fishingPower → flat на
 * 'fishing.luck.rare' («смещает веса редкости вверх»), treasureBias → flat
 * на 'fishing.treasure.weight' (сокровищная тяга), зона подсечки → flat на
 * 'fish.minigame.zonePercent' (потребитель — M18), кап maxFishRarity →
 * flat-минусы на веса редкости ВЫШЕ капа (Бамбуковая: rare). Прочность —
 * durabilityMax. Канал — equipmentProvider M02 (F2); цены = RODS.price
 * (fish.buy), basePrice выровнен с ними (скупка 40%).
 *
 * [DECISION · M07.1] рыба/мусор — стакающиеся (50), rarity вида — витрина
 * альбома; редкость УЛОВА — ось payload (см. balance/fishing.ts).
 */
import type { ItemDef } from './items';

export const FISHING_ITEMS: ItemDef[] = [
  // --- рыбы пруда (пул F3: мелкая ×3 / средняя ×2 / редкая ×1)
  {
    id: 'crucian',
    name: 'Карась',
    itemType: 'fish',
    rarity: 'common',
    basePrice: 6,
    stackable: true,
    maxStack: 50,
  },
  {
    id: 'rotan',
    name: 'Ротан',
    itemType: 'fish',
    rarity: 'common',
    basePrice: 5,
    stackable: true,
    maxStack: 50,
  },
  {
    id: 'perch',
    name: 'Окунь',
    itemType: 'fish',
    rarity: 'common',
    basePrice: 8,
    stackable: true,
    maxStack: 50,
  },
  {
    id: 'tench',
    name: 'Линь',
    itemType: 'fish',
    rarity: 'uncommon',
    basePrice: 18,
    stackable: true,
    maxStack: 50,
  },
  {
    id: 'pike',
    name: 'Щука',
    itemType: 'fish',
    rarity: 'uncommon',
    basePrice: 25,
    stackable: true,
    maxStack: 50,
  },
  {
    id: 'mirror_carp',
    name: 'Зеркальный карп',
    itemType: 'fish',
    rarity: 'rare',
    basePrice: 60,
    stackable: true,
    maxStack: 50,
  },
  {
    // [M07.2 · F11] гейт-рыба пруда (Мифриловая + Икра + ур. 20)
    id: 'golden_carp',
    name: 'Золотой карп',
    itemType: 'fish',
    rarity: 'rare',
    basePrice: 120,
    stackable: true,
    maxStack: 50,
  },
  // --- [M07.2 · F12] рыбы реки (навык Рыболовство 10): мелкая ×3 /
  //     средняя ×2 / редкая ×2 [DECISION-пул спеки] + гейт-рыбы F11
  {
    id: 'loach',
    name: 'Вьюн',
    itemType: 'fish',
    rarity: 'common',
    basePrice: 5,
    stackable: true,
    maxStack: 50,
  },
  {
    id: 'dace',
    name: 'Елец',
    itemType: 'fish',
    rarity: 'common',
    basePrice: 6,
    stackable: true,
    maxStack: 50,
  },
  {
    id: 'gudgeon',
    name: 'Пескарь',
    itemType: 'fish',
    rarity: 'common',
    basePrice: 4,
    stackable: true,
    maxStack: 50,
  },
  {
    id: 'chub',
    name: 'Голавль',
    itemType: 'fish',
    rarity: 'uncommon',
    basePrice: 22,
    stackable: true,
    maxStack: 50,
  },
  {
    id: 'zander',
    name: 'Судак',
    itemType: 'fish',
    rarity: 'uncommon',
    basePrice: 30,
    stackable: true,
    maxStack: 50,
  },
  {
    id: 'trout',
    name: 'Форель',
    itemType: 'fish',
    rarity: 'rare',
    basePrice: 55,
    stackable: true,
    maxStack: 50,
  },
  {
    id: 'sturgeon',
    name: 'Осётр',
    itemType: 'fish',
    rarity: 'rare',
    basePrice: 90,
    stackable: true,
    maxStack: 50,
  },
  {
    // [M07.2 · F11] гейт-рыба реки — заглушка-замок (ачивка «Хозяина
    // озера» — M08): не открывается до сеанса M08
    id: 'ice_char',
    name: 'Ледяная нерка',
    itemType: 'fish',
    rarity: 'rare',
    basePrice: 70,
    stackable: true,
    maxStack: 50,
  },
  {
    // [M07.2 · F11] гейт-рыба реки — заглушка-замок (ачивка «Глубины» —
    // M12, босс слоя 3) + Легендарная приманка
    id: 'ancient_som',
    name: 'Древний сом',
    itemType: 'fish',
    rarity: 'epic',
    basePrice: 200,
    stackable: true,
    maxStack: 50,
  },
  // --- [M07.2 · F13] Карта сокровищ (сундук-таблица, вес 10): при вылове
  //     запускает событие-мини «Клад» с выбором; «Спрятать» — трофей/продажа
  {
    id: 'treasure_map',
    name: 'Карта сокровищ',
    itemType: 'treasure',
    rarity: 'uncommon',
    basePrice: 25,
    stackable: true,
    maxStack: 50,
  },
  // --- мусор (категория «мусор»; скупка — PriceBus 40%)
  {
    id: 'old_boot',
    name: 'Старый ботинок',
    itemType: 'fish',
    rarity: 'common',
    basePrice: 1,
    stackable: true,
    maxStack: 50,
  },
  {
    id: 'seaweed',
    name: 'Пучок водорослей',
    itemType: 'fish',
    rarity: 'common',
    basePrice: 1,
    stackable: true,
    maxStack: 50,
  },
  {
    id: 'rusty_can',
    name: 'Ржавая банка',
    itemType: 'fish',
    rarity: 'common',
    basePrice: 1,
    stackable: true,
    maxStack: 50,
  },
  // --- наживки ×4 новые (Червяк worm_bait — catalog-shelves с фазы 2)
  {
    id: 'fly_bait',
    name: 'Муха',
    itemType: 'bait',
    rarity: 'common',
    basePrice: 5,
    stackable: true,
    maxStack: 50,
  },
  {
    id: 'caviar_bait',
    name: 'Икра',
    itemType: 'bait',
    rarity: 'uncommon',
    basePrice: 25,
    stackable: true,
    maxStack: 50,
  },
  {
    id: 'moth_bait',
    name: 'Светящийся мотыль',
    itemType: 'bait',
    rarity: 'uncommon',
    basePrice: 40,
    stackable: true,
    maxStack: 50,
  },
  {
    id: 'legendary_bait',
    name: 'Легендарная приманка',
    itemType: 'bait',
    rarity: 'rare',
    basePrice: 150,
    stackable: true,
    maxStack: 50,
  },
  // --- удочки ×6 (лестница F4; статы = baseStats, канал equipmentProvider)
  {
    // тир 1: стартовая; кап rare (механизм капа жив с первой удочки)
    id: 'bamboo_rod',
    name: 'Бамбуковая удочка',
    itemType: 'rod',
    subType: 'rod',
    rarity: 'common',
    basePrice: 50,
    durabilityMax: 30,
    modSlots: { budgetBase: 10, tags: ['rod'] },
    baseStats: {
      'fishing.weight.epic': -4,
      'fishing.weight.legendary': -0.9,
      'fishing.weight.mythic': -0.1,
    },
  },
  {
    // тир 2: fishingPower 5
    id: 'walnut_rod',
    name: 'Ореховая удочка',
    itemType: 'rod',
    subType: 'rod',
    rarity: 'uncommon',
    basePrice: 150,
    durabilityMax: 40,
    modSlots: { budgetBase: 16, tags: ['rod'] },
    baseStats: { 'fishing.luck.rare': 5 },
  },
  {
    // тир 3: fishingPower 10 + treasureBias 25 (сокровища ×1.25)
    id: 'glass_rod',
    name: 'Стеклянная удочка',
    itemType: 'rod',
    subType: 'rod',
    rarity: 'rare',
    basePrice: 400,
    durabilityMax: 60,
    modSlots: { budgetBase: 25, tags: ['rod'] },
    baseStats: { 'fishing.luck.rare': 10, 'fishing.treasure.weight': 25 },
  },
  {
    // тир 4: fishingPower 20 + treasureBias 50 + зона +15%
    id: 'carbon_rod',
    name: 'Карбоновая удочка',
    itemType: 'rod',
    subType: 'rod',
    rarity: 'epic',
    basePrice: 900,
    durabilityMax: 80,
    modSlots: { budgetBase: 40, tags: ['rod'] },
    baseStats: {
      'fishing.luck.rare': 20,
      'fishing.treasure.weight': 50,
      'fish.minigame.zonePercent': 15,
    },
  },
  {
    // тир 5: fishingPower 35 + treasureBias 100 (сокровища ×2) + зона +20%
    id: 'mithril_rod',
    name: 'Мифриловая удочка',
    itemType: 'rod',
    subType: 'rod',
    rarity: 'epic',
    basePrice: 2000,
    durabilityMax: 120,
    modSlots: { budgetBase: 40, tags: ['rod'] },
    baseStats: {
      'fishing.luck.rare': 35,
      'fishing.treasure.weight': 100,
      'fish.minigame.zonePercent': 20,
    },
  },
  {
    // тир 6 «легендарная»: fishingPower 50 + treasureBias 150 + зона +30%
    id: 'flow_rod',
    name: 'Удочка «Поток»',
    itemType: 'rod',
    subType: 'rod',
    rarity: 'legendary',
    basePrice: 5000,
    durabilityMax: 200,
    modSlots: { budgetBase: 60, tags: ['rod'] },
    baseStats: {
      'fishing.luck.rare': 50,
      'fishing.treasure.weight': 150,
      'fish.minigame.zonePercent': 30,
    },
  },
];
