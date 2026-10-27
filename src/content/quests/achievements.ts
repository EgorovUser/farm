/**
 * АЧИВКИ M15.2 (карточка §5: «~40 в content/achievements.ts», адаптация к
 * живым системам фазы 2 — N4/N8): заточка/крафт/торговля/модфорж/уровень/
 * предметы/квесты-мета. КАЖДАЯ несёт unlockFlags — флаги производятся при
 * unlock и читаются гейтами (ассортимент M04 — фикстуры-предметы в
 * content/items/catalog-rewards.ts; срезы/боссы/рыбы — фазы 3–5).
 *
 * Порог ach_regular_customer поднят 25 → 100 — буква карточки §5
 * («Постоянный клиент» — 100 покупок; комментарий M15.1 обещал подъём).
 * hidden (пасхалки, ≥2): «Скромность», «Философия камня», «Терпение».
 * Числа — стартовые (тюнюется, П6).
 *
 * [РАСПИЛ · §4.8] файл ушёл за жёлтую зону §4.8 (435 при 46 ачивках) —
 * thematic-части в исходном порядке массива (конкатенация 1:1): forge/craft/
 * trade/life/meta.
 */
import type { AchievementDef } from './types';
import { ACHIEVEMENTS_FORGE } from './achievements-forge';
import { ACHIEVEMENTS_CRAFT } from './achievements-craft';
import { ACHIEVEMENTS_TRADE } from './achievements-trade';
import { ACHIEVEMENTS_LIFE } from './achievements-life';
import { ACHIEVEMENTS_META } from './achievements-meta';
// [M12.2] шахта: ach_mine_boss_<n> ×9 (бриф G2/G3 — поимённое санкционированное
// расширение пула; условие hasItem(трофей слоя), auto-claim живой)
import { ACHIEVEMENTS_MINE } from './achievements-mine';

export const ACHIEVEMENTS: AchievementDef[] = [
  ...ACHIEVEMENTS_FORGE, // 12 — заточка (hidden ×2)
  ...ACHIEVEMENTS_CRAFT, // 9 — крафт
  ...ACHIEVEMENTS_TRADE, // 8 — торговля
  ...ACHIEVEMENTS_LIFE, // 13 — модфорж/игрок/инвентарь/ферма/загон (hidden ×1)
  ...ACHIEVEMENTS_META, // 5 — квесты-мета
  ...ACHIEVEMENTS_MINE, // 9 — шахта (боссы слоёв, M12.2)
];
