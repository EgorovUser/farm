/**
 * Русская локаль ядра и debug-консоли.
 * Названия систем/валют — только здесь, не в логике.
 */

export const CURRENCY_LABELS_RU: Record<string, string> = {
  gold: 'золото',
  copper: 'медь',
  tin: 'олово',
  iron: 'железо',
  silver: 'серебро',
  nuggets: 'самородки',
  mithril: 'мифрил',
  adamant: 'адамант',
  stone: 'камень',
  logs: 'брёвна',
  planks: 'доски',
  fiber: 'волокно',
  leather: 'кожа',
  nails: 'гвозди',
  coal: 'уголь',
  feed: 'корм',
  fertilizer: 'удобрение',
  caviar: 'икра',
  'ingot:bronze': 'бронзовый слиток',
  'ingot:iron': 'железный слиток',
};

export const ITEM_TYPE_LABELS_RU: Record<string, string> = {
  tool: 'инструмент',
  weapon: 'оружие',
  armor: 'броня',
  shield: 'щит',
  rod: 'удочка',
  consumable: 'расходник',
  seed: 'семена',
  bait: 'наживка',
  fish: 'рыба',
  treasure: 'сокровище',
  component: 'компонент',
};

export const OP_LABELS_RU: Record<string, string> = {
  flat: '+ плоско',
  inc: '+ % (склад.)',
  more: '× % (мультиплик.)',
  override: 'замена',
  cap: 'предел',
};

export const PHASE_LABEL = 'Фаза 0 · Ядро';
