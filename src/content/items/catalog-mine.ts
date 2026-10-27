/**
 * Каталог M12.2: трофеи шахты ×9 — по одному на слой (G5 «трофеи (коллекция/
 * ачивки)»; бриф SESSION-M12.2). Прецедент добавления — [M07] F7: модуль
 * расширяет каталог своим файлом, пул магазина M04 НЕ тронут (N=60 цел,
 * трофеи в магазине не продаются — только победа над боссом слоя).
 *
 * Функция предмета: доказательство победы над боссом слоя n → ачивка
 * ach_mine_boss_<n> = hasItem(трофей) — auto-claim M15 живой (item.acquired
 * → syncAchievements). Продать можно (запись о наличии уже в срезе квестов),
 * выкупить нельзя.
 */
import type { ItemDef } from './items';

export const MINE_ITEMS: ItemDef[] = [
  {
    id: 'trophy_mine_1',
    name: 'Венец паучьей королевы',
    itemType: 'treasure',
    rarity: 'rare',
    basePrice: 150, // тюнюется (П6)
    stackable: false,
  },
  {
    id: 'trophy_mine_2',
    name: 'Сердце каменного владыки',
    itemType: 'treasure',
    rarity: 'rare',
    basePrice: 200, // тюнюется
    stackable: false,
  },
  {
    id: 'trophy_mine_3',
    name: 'Чешуя глубинного змея',
    itemType: 'treasure',
    rarity: 'rare',
    basePrice: 260, // тюнюется
    stackable: false,
  },
  {
    id: 'trophy_mine_4',
    name: 'Венец глубинной королевы',
    itemType: 'treasure',
    rarity: 'rare',
    basePrice: 330, // тюнюется
    stackable: false,
  },
  {
    id: 'trophy_mine_5',
    name: 'Монолитное сердце',
    itemType: 'treasure',
    rarity: 'rare',
    basePrice: 400, // тюнюется
    stackable: false,
  },
  {
    id: 'trophy_mine_6',
    name: 'Чешуя бездны',
    itemType: 'treasure',
    rarity: 'rare',
    basePrice: 480, // тюнюется
    stackable: false,
  },
  {
    id: 'trophy_mine_7',
    name: 'Терновый венец',
    itemType: 'treasure',
    rarity: 'legendary',
    basePrice: 560, // тюнюется
    stackable: false,
  },
  {
    id: 'trophy_mine_8',
    name: 'Ядро титана',
    itemType: 'treasure',
    rarity: 'legendary',
    basePrice: 650, // тюнюется
    stackable: false,
  },
  {
    id: 'trophy_mine_9',
    name: 'Око змея',
    itemType: 'treasure',
    rarity: 'legendary',
    basePrice: 750, // тюнюется
    stackable: false,
  },
];
