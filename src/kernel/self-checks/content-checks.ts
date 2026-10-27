/**
 * Self-checks контент-реестра (03-DATA §11): zod-валидация, отказ с путём,
 * каталог баз, поиск предметов.
 */
import { ContentRegistry } from '@/kernel/content/content-registry';
import { BASES_TABLE } from '@/content/balance/bases';
import { ECONOMY_TABLE } from '@/content/balance/economy';
import { ITEMS } from '@/content/items/items';
import { basesTableSchema, economySchema, itemsSchema } from '@/kernel/content/schemas';
import { check, group, type CheckGroup, type CheckResult } from './types';

export function runContentChecks(): CheckGroup {
  const results: CheckResult[] = [];
  const content = new ContentRegistry();

  // штатная загрузка
  let loaded = true;
  try {
    content.register('bases', basesTableSchema, BASES_TABLE);
    content.register('economy', economySchema, ECONOMY_TABLE);
    content.register('items', itemsSchema, ITEMS);
  } catch {
    loaded = false;
  }
  results.push(check('стартовый контент проходит валидацию', () => loaded));

  // базы: читаются, недокументированный стат — исключение (П2)
  results.push(check('база player.energy.max = 100', () => content.base('player.energy.max') === 100));
  results.push(
    check('недокументированный стат — исключение при старте', () => {
      try {
        content.base('no.such.stat');
        return false;
      } catch (e) {
        return String(e).includes('не задокументирован');
      }
    }),
  );

  // битый предмет: отказ с указанием поля
  const badContent = new ContentRegistry();
  let message = '';
  try {
    badContent.register('items', itemsSchema, [
      { id: 'Bad-Id', name: 'Плохой предмет', itemType: 'tool', rarity: 'common', basePrice: 5 },
    ]);
  } catch (e) {
    message = String(e);
  }
  results.push(
    check('битый контент = отказ с указанием поля', () => message.includes('items') && message.includes('id'), {
      expected: 'ошибка с путём items[*].id',
      actual: message.split('\n')[0],
    }),
  );

  // битая экономика ловится схемой
  let econMessage = '';
  try {
    badContent.register('economy', economySchema, { ...ECONOMY_TABLE, sellRatePercent: 'много' });
  } catch (e) {
    econMessage = String(e);
  }
  results.push(check('нечисловой баланс ловится схемой', () => econMessage.includes('sellRatePercent')));

  // поиск предметов
  results.push(check('item() находит предмет', () => content.item('iron_pickaxe').name === 'Железная кирка'));
  results.push(
    check('item() на неизвестный id — исключение', () => {
      try {
        content.item('no_such_item');
        return false;
      } catch {
        return true;
      }
    }),
  );

  // расширение неизвестным типом — рядовой случай (П5), но валидация строга к форме
  results.push(check('таблицы реестра перечислимы', () => content.tableNames().length >= 3));

  return group('ContentRegistry · валидация (03-DATA §11)', results);
}
