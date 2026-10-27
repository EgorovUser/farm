/**
 * ЛЕСТНИЦА УДОЧЕК (карточка M07 §4, бриф F4): Бамбуковая → Ореховая →
 * Стеклянная → Карбоновая → Мифриловая → «Поток» (легендарная).
 *
 * Параметры удочки (fishingPower / treasureBias / minigame.zoneSize /
 * maxFishRarity / прочность) живут в ПРЕДМЕТНЫХ ДЕФАХ (content/items/
 * catalog-fishing.ts) — ЕДИНСТВЕННЫЙ источник: baseStats → flat через
 * equipmentProvider M02 (канал F2), durabilityMax — поле дефа. Этот файл —
 * витринно-покупочная таблица fish.buy: defId + тир лестницы + цена прямой
 * продажи (прецедент pen.buy: цена в контент-дефе модуля).
 *
 * [DECISION · M07.1 · редкости лестницы] Бамбуковая common / Ореховая
 * uncommon / Стеклянная rare / Карбоновая epic / Мифриловая epic / «Поток»
 * legendary: пометка брифа «(легендарная)» на «Потоке» разграничивает
 * соседей — Мифриловая НЕ легендарная; двух-эпик ladder (Карбоновая 900з /
 * Мифриловая 2000з) различается шаблонными статами и прочностью 80/120.
 *
 * [DECISION · M07.1 · кап на стартовой] maxFishRarity: rare — ТОЛЬКО у
 * Бамбуковой (механизм капа жив с первой удочки: flat-минусы на веса
 * epic/legendary/mythic в baseStats; старшие удочки без капа). Дноход-класс
 * (×4 сокровища + кап uncommon) — пример карточки, будущие удочки.
 *
 * Вне лестницы (willow_rod / oak_rod, itemType 'rod') — экипируемы и ловят
 * (П5: любая удочка), тир 0, без рыболовных статов.
 */
import type { ID } from '@/shared/types/ids';

export interface RodShopDef {
  defId: ID;
  name: string;
  /** тир лестницы 1..6 (гейт-условия рыб rodTierAtLeast; вне лестницы — 0) */
  tier: number;
  /** цена прямой продажи fish.buy (TransactionService, БЕЗ энергии) */
  price: number;
}

export const RODS: RodShopDef[] = [
  { defId: 'bamboo_rod', name: 'Бамбуковая удочка', tier: 1, price: 50 },
  { defId: 'walnut_rod', name: 'Ореховая удочка', tier: 2, price: 150 },
  { defId: 'glass_rod', name: 'Стеклянная удочка', tier: 3, price: 400 },
  { defId: 'carbon_rod', name: 'Карбоновая удочка', tier: 4, price: 900 },
  { defId: 'mithril_rod', name: 'Мифриловая удочка', tier: 5, price: 2000 },
  { defId: 'flow_rod', name: 'Удочка «Поток»', tier: 6, price: 5000 },
];
