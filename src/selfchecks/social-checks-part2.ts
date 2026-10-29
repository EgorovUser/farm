/**
 * Self-checks M17 «Соц» — часть 2 (бриф G6: титулы ×4/нейтральность
 * экономики/roundtrip байт-в-байт/пост-wipe тишина/реестр-нейтральность/
 * манифест = факту/состав профиля = данным).
 */
import { titleOf } from '@/game/modules/social/view';
import { SOCIAL_PROFILE } from '@/content/social/profile';
import { check, type CheckResult } from './types';
import {
  boardOf,
  dayTickAt,
  giveItems,
  localDateISO,
  mailOf,
  makeSeededSocialGame,
  makeSocialGame,
  openSocialVillage,
  profileOf,
  readSocialSlice,
  SOCIAL_T0,
  type R,
  type SocialFixture,
} from './social-fixture';

const DAY0 = localDateISO(SOCIAL_T0);
const DAY = 86_400_000;

/** исполнить сегодняшний контракт партнёра (дать предметы → fulfill) */
function fulfillPartner(f: SocialFixture, partnerId: string): R<unknown> {
  const view = f.village['village.trade']() as {
    contracts: Array<{ partnerId: string; item: string; qty: number; gateLine: string | null }>;
  };
  const c = view.contracts.find((r) => r.partnerId === partnerId)!;
  giveItems(f, c.item, c.qty);
  return f.village['village.trade.fulfill'](partnerId) as R<unknown>;
}

export async function runSocialPart2(): Promise<CheckResult[]> {
  const results: CheckResult[] = [];

  // 9. титулы ×4 (шкала M16.3 читается через deps) + рост живьём сделками
  {
    const pure =
      titleOf(false, []) === 'Чужак' &&
      titleOf(true, [
        { level: 0, levelName: 'Чужак' },
        { level: 1, levelName: 'Знакомый' },
      ]) === 'Знакомый' &&
      titleOf(true, [
        { level: 1, levelName: 'Знакомый' },
        { level: 2, levelName: 'Поставщик' },
      ]) === 'Поставщик' &&
      titleOf(true, [
        { level: 2, levelName: 'Поставщик' },
        { level: 3, levelName: 'Друг деревни' },
        { level: 0, levelName: 'Чужак' },
      ]) === 'Друг деревни';
    const f = await makeSeededSocialGame('m171-title');
    openSocialVillage(f);
    const start = profileOf(f);
    // Зернополье: старт 10 («Знакомый»); +4 за контракт; 5 дней → 30 («Поставщик»)
    for (let d = 1; d <= 5; d++) {
      const r = fulfillPartner(f, 'zernopolye');
      if (!r.ok) throw new Error(`fulfill день ${d}: ${r.error}`);
      dayTickAt(f, d);
    }
    const grown = profileOf(f);
    results.push(
      check(
        'титулы ×4 (G4): Чужак → Знакомый → Поставщик → Друг деревни (максимум по партнёрам; запертая деревня — «Чужак»); рост живьём: 5 контрактов Зернополья → «Поставщик»',
        () => pure && start.title === 'Знакомый' && grown.title === 'Поставщик',
        {
          expected: 'старт «Знакомый» → после 5 сделок «Поставщик»',
          actual: `${start.title} → ${grown.title}; шкала=${pure}`,
        },
      ),
    );
    f.dispose();
  }

  // 10. нейтральность экономики: счётчики/кошелёк/деревня до/после идентичны; событий ×0
  {
    const f = await makeSeededSocialGame('m171-neutral');
    openSocialVillage(f);
    f.village['village.trade'](); // день биржи оседает (ленивая ротация деревни)
    f.events.length = 0; // события открытия/ротации — НЕ соц-чтения
    const before = {
      counters: JSON.stringify(f.game.stats.snapshot()),
      gold: f.game.wallet.get('gold'),
      village: JSON.stringify(f.village['village.state']()),
    };
    boardOf(f);
    mailOf(f);
    mailOf(f, 'read');
    profileOf(f);
    f.social['social.force']() as { header: string };
    boardOf(f);
    const after = {
      counters: JSON.stringify(f.game.stats.snapshot()),
      gold: f.game.wallet.get('gold'),
      village: JSON.stringify(f.village['village.state']()),
    };
    results.push(
      check(
        'нейтральность экономики (G1/G6): counters/кошелёк/деревня до/после соц-действий идентичны; событий (транзакции/ачивки/инвалидации) — 0',
        () =>
          before.counters === after.counters &&
          before.gold === after.gold &&
          before.village === after.village &&
          f.events.length === 0,
        {
          expected: 'идентичны; события ×0',
          actual: `counters=${before.counters === after.counters}; gold=${before.gold === after.gold}; деревня=${before.village === after.village}; события=${f.events.length}`,
        },
      ),
    );
    f.dispose();
  }

  // 11. roundtrip байт-в-байт (файл → load → save) + пост-wipe тишина
  {
    const f = await makeSeededSocialGame('m171-round');
    openSocialVillage(f);
    mailOf(f, 'read');
    await f.game.save.save();
    const file1 = JSON.parse((await f.storage.get('main')) as string) as { modules: Record<string, unknown> };
    const slice1 = JSON.stringify(file1.modules['social']);
    // новая игра на том же хранилище: load → save → identity среза
    const g = await makeSocialGame(f.storage);
    await g.game.save.save();
    const file2 = JSON.parse((await f.storage.get('main')) as string) as { modules: Record<string, unknown> };
    const slice2 = JSON.stringify(file2.modules['social']);
    const marker1 = (file1.modules['social'] as { mailReadDay?: string }).mailReadDay;
    g.dispose();
    // пост-wipe тишина: чистая игра — чтения НЕ пишут ключей
    const fresh = await makeSocialGame();
    boardOf(fresh);
    mailOf(fresh);
    profileOf(fresh);
    await fresh.game.save.save();
    const file3 = JSON.parse((await fresh.storage.get('main')) as string) as { modules: Record<string, unknown> };
    results.push(
      check(
        'roundtrip байт-в-байт (G6) + пост-wipe тишина: срез {v:1, mailReadDay} файл→load→save идентичен; чистая игра после чтений — ключей social/village в файле НЕТ',
        () =>
          slice1 === slice2 &&
          slice1.includes('"v":1') &&
          marker1 === DAY0 &&
          !('social' in file3.modules) &&
          !('village' in file3.modules),
        {
          expected: 'A≡C байт-в-байт; чистая игра без ключей',
          actual: `roundtrip=${slice1 === slice2}; маркер=${marker1}; чистая: social=${'social' in file3.modules}, village=${'village' in file3.modules}`,
        },
      ),
    );
    f.dispose();
    fresh.dispose();
  }

  // 12. реестр-нейтральность: 0 новых событий/провайдеров/счётчиков/задач/ачивок/товаров
  {
    const f = await makeSocialGame();
    const m = f.game.modules.get('social')!.manifest;
    const statProviders = f.game.statBus.providerIds().length;
    const priceProviders = f.game.priceBus.providerIds().length;
    const tasks = f.game.tasks.list ? f.game.tasks.list().length : -1;
    const achPool = f.game.content.get<Array<{ id: string }>>('quests.achievements').length;
    const shopPool = f.game.content.get<Array<{ id: string }>>('shop.pool').length;
    const socialEvents = f.game.bus.eventNames().filter((n) => n.startsWith('social.'));
    results.push(
      check(
        'реестр-нейтральность (G1/G6): манифест social — события/подписки/провайдеры Stat+Price/задачи/счётчики ВСЕ ПУСТЫ; шины/пулы живого реестра НЕ выросли (StatBus 17 · PriceBus 4 · задачи 15 · ачивки 62 · магазин 60); событий social.* в шине 0',
        () =>
          (m.eventsPublished ?? []).length === 0 &&
          (m.eventsSubscribed ?? []).length === 0 &&
          (m.modifierProviders ?? []).length === 0 &&
          (m.priceModifierProviders ?? []).length === 0 &&
          (m.taskExecutors ?? []).length === 0 &&
          (m.statsCounters ?? []).length === 0 &&
          statProviders === 17 &&
          priceProviders === 4 &&
          tasks === 15 &&
          achPool === 62 &&
          shopPool === 60 &&
          socialEvents.length === 0,
        {
          expected: 'пустые декларации; 17/4/15/62/60; social.* ×0',
          actual: `провайдеры ${statProviders}/${priceProviders}; задачи ${tasks}; ачивки ${achPool}; магазин ${shopPool}; social-события ${socialEvents.length}`,
        },
      ),
    );
    f.dispose();
  }

  // 13. манифест = факту: publicApi ×5, версия 1.0.0, команды консоли
  {
    const f = await makeSocialGame();
    const m = f.game.modules.get('social')!.manifest;
    const api = f.game.modules.get('social')!.api;
    const { getCommandRegistry } = await import('@/debug/console');
    const reg = getCommandRegistry();
    const cmd = (name: string) => reg.get(name) !== undefined;
    const expectedApi = ['social.state', 'social.board', 'social.mail', 'social.profile', 'social.force'];
    results.push(
      check(
        'манифест = факту (G1): social 1.0.0 · stateKey social · title «M17 …»; publicApi ровно ×5 (state/board/mail/profile/force) и все живы в api; команды консоли social board/mail/profile/force зарегистрированы',
        () =>
          m.id === 'social' &&
          m.version === '1.0.0' &&
          m.stateKey === 'social' &&
          /^M\d{2} /.test(m.title ?? '') &&
          JSON.stringify(m.publicApi) === JSON.stringify(expectedApi) &&
          expectedApi.every((k) => typeof api[k] === 'function') &&
          cmd('social board') &&
          cmd('social mail') &&
          cmd('social profile') &&
          cmd('social force'),
        {
          expected: '×5 api; ×4 команды; 1.0.0',
          actual: `api=${m.publicApi?.length}; команды=${['social board', 'social mail', 'social profile', 'social force'].filter(cmd).length}; v${m.version}`,
        },
      ),
    );
    f.dispose();
  }

  // 14. состав профиля = данным: счётчики из пула M01 §6 + форма витрины
  {
    const f = await makeSeededSocialGame('m171-prof');
    openSocialVillage(f);
    const p = profileOf(f);
    const countersCfg = new Set(f.game.content.get<Array<{ id: string }>>('player.counters').map((c) => c.id));
    const dataIds = SOCIAL_PROFILE.counters.map((c) => c.id);
    const inPool = dataIds.every((id) => countersCfg.has(id));
    const rowsMatch =
      p.counters.length === SOCIAL_PROFILE.counters.length &&
      p.counters.every((row, i) => row.id === dataIds[i] && row.label === SOCIAL_PROFILE.counters[i]!.label);
    results.push(
      check(
        'профиль = данным (G4): счётчики профиля — строки content/social/profile.ts, каждый id существует в конфиге M01 §6; витрина несёт уровень/XP/золото/ачивки/навыки/гейт/репутацию',
        () =>
          inPool &&
          rowsMatch &&
          p.player.level >= 30 &&
          p.gold >= 0 &&
          p.achievements.unlocked >= 1 &&
          p.achievements.pool === 62 &&
          p.skills.length > 0 &&
          p.village.unlocked &&
          p.reputation.length === 5 &&
          p.day === DAY0,
        {
          expected: 'счётчики = данным (пул M01); форма полная',
          actual: `счётчиков=${p.counters.length}; в пуле=${inPool}; навыки=${p.skills.length}; репутация=${p.reputation.length}`,
        },
      ),
    );
    f.dispose();
  }

  return results;
}
