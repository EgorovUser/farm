/**
 * Self-checks M17 «Соц» — часть 1 (бриф G6: честный замок/детерминизм ×2/
 * смена дня/факты против live/письма-триггеры/mail read/social force).
 * Оракулы руками; срезы читаются из ФАЙЛА сейва (честная истина).
 */
import { boardSeedOf, buildBoardFacts, buildMailCandidates, mailSeedOf, pickLetters, pickNotes } from '@/game/modules/social/logic';
import type { SocialNewsTable } from '@/content/social/types';
import { check, type CheckResult } from './types';
import {
  boardOf,
  dayTickAt,
  giveItems,
  itemNameOf,
  localDateISO,
  mailOf,
  makeSeededSocialGame,
  makeSocialGame,
  openSocialVillage,
  profileOf,
  readSocialSlice,
  socialStateOf,
  vitrinesOf,
  rawModules,
  SOCIAL_T0,
  type R,
} from './social-fixture';

const DAY0 = localDateISO(SOCIAL_T0);

export async function runSocialPart1(): Promise<CheckResult[]> {
  const results: CheckResult[] = [];

  // 1. честный замок до гейта + тишина файла (G1/G3: НЕ падение; профиль жив)
  {
    const f = await makeSocialGame();
    const b = boardOf(f);
    const m = mailOf(f);
    const p = profileOf(f);
    const s = socialStateOf(f);
    const mods = await rawModules(f);
    results.push(
      check(
        'честный замок до гейта (G1/G3): доска/письма — гейт-строки текстом (НЕ падение); профиль ЖИВ («Чужак», уровень, пул 62); чтения НЕ материализуют НИ social, НИ village',
        () =>
          b.locked &&
          b.gateLines.length === 2 &&
          b.gateLines[0]!.includes('уровень игрока 30') &&
          b.gateLines[1]!.includes('Мастер хутора') &&
          m.locked &&
          p.title === 'Чужак' &&
          p.player.level === 1 &&
          p.achievements.pool === 62 &&
          s.readToday === false &&
          !('social' in mods) &&
          !('village' in mods),
        {
          expected: 'замок ×2; профиль жив; файл без ключей social/village',
          actual: `board=${b.locked}; mail=${m.locked}; титул=${p.title}; ach=${p.achievements.unlocked}/${p.achievements.pool}; social=${'social' in mods}; village=${'village' in mods}`,
        },
      ),
    );
    f.dispose();
  }

  // 2. детерминизм доски ×2 + структура 3–5 + голова сводки (G2)
  {
    const f = await makeSeededSocialGame('m171-det');
    openSocialVillage(f);
    const b1 = boardOf(f);
    const b2 = boardOf(f);
    const kinds = b1.notes.map((n) => n.kind);
    results.push(
      check(
        'детерминизм доски ×2 (G2): одна дата + одно состояние → идентичные заметки; заметок 3–5; голова сводки — уровень+налог; тексты не пустые',
        () =>
          JSON.stringify(b1.notes) === JSON.stringify(b2.notes) &&
          b1.day === DAY0 &&
          b1.notes.length >= 3 &&
          b1.notes.length <= 5 &&
          kinds[0] === 'village-level' &&
          kinds[1] === 'tax' &&
          b1.notes.every((n) => n.text.length > 3 && n.id.length > 0),
        {
          expected: '×2 идентично; 3..5; [village-level, tax, …]',
          actual: `${JSON.stringify(b1.notes) === JSON.stringify(b2.notes)}; ${b1.notes.length}; [${kinds.join(', ')}]`,
        },
      ),
    );
    f.dispose();
  }

  // 3. смена дня → новый ролл (G2: смена дня → новый ролл)
  {
    const f = await makeSeededSocialGame('m171-det');
    openSocialVillage(f);
    const day0 = boardOf(f);
    dayTickAt(f, 1);
    const day1 = boardOf(f);
    results.push(
      check(
        'смена дня → новый ролл (G2): time +1d → день N+1 в витрине, состав заметок/данных дня другой',
        () =>
          day0.day === DAY0 &&
          day1.day === localDateISO(SOCIAL_T0 + 86_400_000) &&
          JSON.stringify(day0.notes) !== JSON.stringify(day1.notes),
        {
          expected: `${DAY0} → ${localDateISO(SOCIAL_T0 + 86_400_000)}; заметки другие`,
          actual: `${day0.day} → ${day1.day}; совпадение=${JSON.stringify(day0.notes) === JSON.stringify(day1.notes)}`,
        },
      ),
    );
    f.dispose();
  }

  // 4. факты доски против live-состояния + конвейер = витрине (просьба → ворчун → предвестник)
  {
    const f = await makeSeededSocialGame('m171-facts');
    openSocialVillage(f);
    // фаза А: свежая деревня — просьбы живут (потребности не закрыты)
    const freshFacts = buildBoardFacts(vitrinesOf(f), itemNameOf(f));
    const freshRequests = freshFacts.filter((x) => x.kind === 'villager-request');
    const vsFresh = f.village['village.state']() as { villagers: Array<{ need: { item: string; qty: number } | null }> };
    const liveNeeds = vsFresh.villagers.filter((r) => r.need !== null);
    // фаза Б: 3 дня без поставок → ворчуны (грумблинг = порог M16.1)
    dayTickAt(f, 1);
    dayTickAt(f, 2);
    dayTickAt(f, 3);
    // предвестник рейда — дев-форс стадии 1 (warning)
    const force = f.village['village.raid.force']() as R<{ header: string }>;
    const v = vitrinesOf(f);
    const facts = buildBoardFacts(v, itemNameOf(f));
    const grumblersLive = v.state.villagers.filter((r) => r.grumbler).map((r) => r.name);
    const grumblerFacts = facts.filter((x) => x.kind === 'villager-grumbler').map((x) => x.params['name']);
    const raidWarnFact = facts.some((x) => x.kind === 'raid-warning');
    // конвейер: pickNotes(facts, table, seed) = заметкам витрины
    const table = f.game.content.get<SocialNewsTable>('social.news');
    const pipeline = pickNotes(facts, table, boardSeedOf('m171-facts', localDateISO(f.clock.now()), 0));
    const view = boardOf(f);
    const vs = f.village['village.state']() as { tax: { grumblers: number } };
    results.push(
      check(
        'факты доски против live (G6): свежие потребности → факты-просьбы с предметом/количеством; 3 дня без поставок → ворчун в стейте = ворчун-факт (имена совпадают); предвестник рейда → факт; конвейер pickNotes = витрине доски',
        () =>
          freshRequests.length === liveNeeds.length &&
          freshRequests.every((x) => x.params['qty'] !== undefined && x.params['item'] !== undefined) &&
          force.ok &&
          grumblersLive.length > 0 &&
          grumblerFacts.length === grumblersLive.length &&
          grumblersLive.every((n) => grumblerFacts.includes(n)) &&
          vs.tax.grumblers === grumblersLive.length &&
          raidWarnFact &&
          JSON.stringify(pipeline) === JSON.stringify(view.notes),
        {
          expected: 'просьбы→ворчуны/предвестник в фактах; конвейер = витрине',
          actual: `просьбы=${freshRequests.length} (живых=${liveNeeds.length}); ворчуны live=${grumblersLive.length}/факты=${grumblerFacts.length}; предвестник=${raidWarnFact}; конвейер=${JSON.stringify(pipeline) === JSON.stringify(view.notes)}`,
        },
      ),
    );
    f.dispose();
  }

  // 5. детерминизм писем ×2 + конвейер = витрине (G3)
  {
    const f = await makeSeededSocialGame('m171-det');
    openSocialVillage(f);
    const m1 = mailOf(f);
    const m2 = mailOf(f);
    const v = vitrinesOf(f);
    const table = f.game.content.get('social.mail') as Parameters<typeof pickLetters>[1];
    const candidates = buildMailCandidates(v, itemNameOf(f), 'староста');
    const pipeline = pickLetters(candidates, table, mailSeedOf('m171-det', localDateISO(f.clock.now()), 0));
    results.push(
      check(
        'детерминизм писем ×2 (G3): одна дата + одно состояние → идентичные письма; конвейер pickLetters = витрине; бейдж «непрочитано» до прочтения',
        () =>
          JSON.stringify(m1.letters) === JSON.stringify(m2.letters) &&
          m1.day === DAY0 &&
          m1.unread === m1.letters.length &&
          JSON.stringify(pipeline) === JSON.stringify(m1.letters),
        {
          expected: '×2 идентично; конвейер = витрине; unread = письмам',
          actual: `писем=${m1.letters.length}; unread=${m1.unread}; конвейер=${JSON.stringify(pipeline) === JSON.stringify(m1.letters)}`,
        },
      ),
    );
    f.dispose();
  }

  // 6. письма-триггеры оракулами (просьба/благодарность/предвестник/тренд)
  {
    const f = await makeSeededSocialGame('m171-mail');
    openSocialVillage(f);
    const before = buildMailCandidates(vitrinesOf(f), itemNameOf(f), 'староста');
    const requestsBefore = before.filter((c) => c.kind === 'request');
    // благодарность: закрываем потребность первого просящего поставкой
    const st = f.village['village.state']() as { villagers: Array<{ id: string; name: string; need: { item: string; qty: number } | null }> };
    const target = st.villagers.find((r) => r.need !== null)!;
    giveItems(f, target.need!.item, target.need!.qty);
    const supply = f.village['village.supply'](target.id, target.need!.item) as R<unknown>;
    const after = buildMailCandidates(vitrinesOf(f), itemNameOf(f), 'староста');
    const thanks = after.filter((c) => c.kind === 'thanks' && c.author === target.name);
    const gone = after.filter((c) => c.kind === 'request' && c.author === target.name).length === 0;
    // предвестник: форс стадии 1
    f.village['village.raid.force']() as R<unknown>;
    const withRaid = buildMailCandidates(vitrinesOf(f), itemNameOf(f), 'староста');
    const raid = withRaid.filter((c) => c.kind === 'raid-warning');
    // тренды биржи живы (день материализован) → хвастовство от партнёра
    const trends = withRaid.filter((c) => c.kind === 'trend-boast');
    const partnerNames = new Set(
      (f.village['village.trade']() as { reputation: Array<{ partnerName: string }> }).reputation.map((r) => r.partnerName),
    );
    results.push(
      check(
        'письма-триггеры (G3/G6): неудовлетворённая потребность → «просит»; поставка → «благодарит» (просьба исчезает); предвестник рейда → письмо «старосты»; тренды → хвастовство партнёра',
        () =>
          requestsBefore.length > 0 &&
          supply.ok &&
          thanks.length === 1 &&
          thanks[0]!.params['item'] !== undefined &&
          gone &&
          raid.length === 1 &&
          raid[0]!.author === 'староста' &&
          trends.length > 0 &&
          trends.every((t) => partnerNames.has(t.author)),
        {
          expected: 'просьбы→благодарность/предвестник/тренд',
          actual: `просьбы=${requestsBefore.length}; благодарности=${thanks.length}; предвестник=${raid.length}; тренды=${trends.length}`,
        },
      ),
    );
    f.dispose();
  }

  // 7. mail read: идемпотентность + материализация среза ТОЛЬКО маркером
  {
    const f = await makeSeededSocialGame('m171-read');
    openSocialVillage(f);
    const listOnly = mailOf(f);
    const before = await readSocialSlice(f);
    const read1 = mailOf(f, 'read');
    const slice1 = await readSocialSlice(f);
    const read2 = mailOf(f, 'read');
    const slice2 = await readSocialSlice(f);
    results.push(
      check(
        'mail read (G3): список НЕ материализует срез; read → {v:1, mailReadDay}=день; повтор идемпотентен (та же запись, unread 0)',
        () =>
          listOnly.unread === listOnly.letters.length &&
          before === undefined &&
          read1.unread === 0 &&
          read1.mailReadDay === DAY0 &&
          slice1 !== undefined &&
          slice1.v === 1 &&
          slice1.mailReadDay === DAY0 &&
          read2.unread === 0 &&
          JSON.stringify(slice1) === JSON.stringify(slice2),
        {
          expected: 'нет ключа → {v:1,mailReadDay} → идемпотентно',
          actual: `до=${before === undefined ? 'нет ключа' : 'ЕСТЬ'}; после=${JSON.stringify(slice1)}; повтор=${JSON.stringify(slice2)}`,
        },
      ),
    );
    f.dispose();
  }

  // 8. social force: переролл витрин + живучесть mailReadDay (G1/G3)
  {
    const f = await makeSeededSocialGame('m171-force');
    openSocialVillage(f);
    const base = boardOf(f);
    mailOf(f, 'read');
    const receipt = f.social['social.force']() as { header: string };
    const rerolled = boardOf(f);
    const rerolled2 = boardOf(f);
    const mailAfter = mailOf(f);
    results.push(
      check(
        'social force (G1/G3): reroll #1 → витрины перегенерированы (другой состав), детерминизм под роллом ×2; mailReadDay НЕ тронут — бейдж «непрочитано» НЕ сфабрикован',
        () =>
          receipt.header.includes('#1') &&
          rerolled.rerolls === 1 &&
          JSON.stringify(rerolled.notes) !== JSON.stringify(base.notes) &&
          JSON.stringify(rerolled.notes) === JSON.stringify(rerolled2.notes) &&
          mailAfter.unread === 0 &&
          mailAfter.mailReadDay === DAY0,
        {
          expected: 'reroll=1; состав другой; ×2 стабилен; unread=0',
          actual: `rerolls=${rerolled.rerolls}; другой=${JSON.stringify(rerolled.notes) !== JSON.stringify(base.notes)}; unread=${mailAfter.unread}; маркер=${mailAfter.mailReadDay}`,
        },
      ),
    );
    f.dispose();
  }

  return results;
}
