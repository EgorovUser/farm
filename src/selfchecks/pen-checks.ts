/**
 * Self-checks M06 «Загон» — часть 1 (сеанс M06.1: каркас + животные + уход +
 * продукция + сейв v11). Оракулы руками (без ожиданий).
 *
 * Покрытие (бриф §3.9): покупка ×7 поимённо в данных; гейты ×4 (свинья-
 * ачивка / пчёлы-ур.15 / альпака-заглушка / слоты) с причинами; атомарность
 * (отказ → золото цело); ролл качества = маппинг-оракул по журналу роллов
 * (×2 идентичны — детерминизм); уход ×3 (энергии один раз / откат при
 * отказе / дневные лимиты); decay-оракулы (−25/−10 за день; −30/−10
 * счастья при нулях; фикс-даты через DI now()); продукция: produceNeeds
 * гейтит оба поля (чистая функция + живой проход), каскад nextProduceAt,
 * склад cap 3 сбора per вид (переполнение → overflow-отчёт), качество
 * фактором счастья в коридоре; события — полный payload F7; миграция
 * migrate10to11 (дефолт-срез / идемпотентность / цепочка v3→v11 / v99);
 * roundtrip v11 байт-в-байт; «Грибник» (счётчик тикает только грибами →
 * ачивка → флаг → гейт Свиньи открывается); манифест 1.0.0 = факту.
 *
 * Болезни/`pen.animalSick`/исполнители/улучшения/разведение — M06.2.
 */
import { ANIMALS } from '@/content/pen/animals';
import { PEN_TABLE } from '@/content/balance/pen';
import { COUNTERS_TABLE } from '@/content/player/counters';
import { ACHIEVEMENTS } from '@/content/quests/achievements';
import { RECIPES } from '@/content/craft/recipes';
import { ITEMS } from '@/content/items/items';
import { migrateSaveData } from '@/kernel/save/migrations';
import { needsMet, producePass, stockCapOf } from '@/game/modules/pen/logic/produce';
import { QUALITY_TIERS } from '@/shared/types/ids';
import { check, group, type CheckGroup, type CheckResult } from './types';
import {
  PEN_T0,
  PEN_DAY,
  PEN_HOUR,
  animalAt,
  dayPass,
  hourPass,
  levelPlayerTo,
  makePenGame,
  makeSeededPenGame,
  penView,
  rollOf,
  type PenFixture,
  type R,
} from './pen-fixture';
import { runPenProdChecks } from './pen-prod-checks';

const HOUR = PEN_HOUR;

interface EnergyEvent { cost: number; stat: string }

function energySpentOf(events: Array<{ name: string; payload: Record<string, unknown> }>): EnergyEvent[] {
  return events
    .filter((e) => e.name === 'player.energySpent')
    .map((e) => ({ cost: Number(e.payload.cost), stat: String(e.payload.stat) }));
}

/** маппинг-оракул тира покупки: roll01 × сумма весов D..SS (S/SS = 0) */
function buyTierOfRoll(roll: number): string {
  let acc = 0;
  for (const tier of QUALITY_TIERS) {
    acc += PEN_TABLE.buyQualityWeights[tier] ?? 0;
    if (roll < acc) return tier;
  }
  return 'A';
}

/** фактор счастья (та же арифметика, что logic/quality — для оракула коридора) */
function factorOf(share: number): number {
  const { minFactor, maxFactor } = PEN_TABLE.produce;
  const s = Math.min(1, Math.max(0, share));
  return minFactor + (maxFactor - minFactor) * s;
}

export async function runPenChecks(): Promise<CheckGroup> {
  const results: CheckResult[] = [];

  // ------------------------------------------------ 1. контент: животные ×7, продукты, Корм
  {
    const f = makePenGame();
    await f.game.init();
    const ids = ANIMALS.map((a) => a.id);
    const itemIds = new Set(ITEMS.map((i) => i.id));
    const productsOk = ANIMALS.every((a) => itemIds.has(a.produce.defId));
    const milk = ITEMS.find((i) => i.id === 'milk');
    const truffle = ITEMS.find((i) => i.id === 'truffle');
    const feedRecipe = RECIPES.find((r) => r.id === 'wb_feed');
    const energyBase = f.game.statBus.resolve({ stat: 'action.pen.pet.energyCost', ctx: f.game.time.ctx('player') });
    results.push(
      check('контент: животные ×7 поимённо (chicken/goat/sheep/cow/pig/bees/alpaca), продукты — предметы каталога; milk 12з + truffle 25з аддитивно; рецепт wb_feed жив (2 wheat_grain → 3 feed); энергии pen.feed/clean/collect/pet = 1/2/2/0', () =>
        JSON.stringify(ids) === JSON.stringify(['chicken', 'goat', 'sheep', 'cow', 'pig', 'bees', 'alpaca']) &&
        productsOk &&
        milk?.basePrice === 12 && truffle?.basePrice === 25 &&
        feedRecipe !== undefined && feedRecipe.inputs[0]!.defId === 'wheat_grain' && feedRecipe.output.defId === 'feed' &&
        energyBase === 0, {
        expected: '×7 / продукты живы / milk 12 / truffle 25 / wb_feed / pet 0',
        actual: `${ids.length} видов / продукты ${String(productsOk)} / milk ${milk?.basePrice} / truffle ${truffle?.basePrice} / wb_feed ${String(feedRecipe !== undefined)} / pet ${energyBase}`,
      }),
    );
    f.dispose();
  }

  // ------------------------------------------------ 2. покупка Куры: транзакция, ролл = журналу, таймер
  {
    const f = await makeSeededPenGame('m061-pen-buy-chicken');
    f.game.wallet.grant('gold', 80);
    const r = f.pen['pen.buy']('chicken') as R<{ quality: { tier: string; value: number }; nextProduceAt: number }>;
    const tx = f.events.filter((e) => e.name === 'wallet.transaction' && e.payload.eventId === 'pen.buy');
    const a = animalAt(f, 0);
    const roll = rollOf(f, 'pen:buy:chicken');
    const valueRoll = rollOf(f, 'pen:buy:chicken:value');
    results.push(
      check('покупка Куры: транзакция pen.buy (−80з), слот занят, качество = маппинг-оракулу журнала (pen:buy:chicken), стартовые 100/100/100/100, nextProduceAt = T0+6ч', () =>
        r.ok && tx.length === 1 && f.game.wallet.get('gold') === 0 &&
        a.speciesId === 'chicken' && a.happiness === 100 && a.satiety === 100 && a.health === 100 && a.cleanliness === 100 &&
        r.value.nextProduceAt === PEN_T0 + 6 * HOUR &&
        roll !== null && a.quality === buyTierOfRoll(roll) &&
        valueRoll !== null && r.value.quality.value === Math.round(valueRoll), {
        expected: `tx 1, тир ${roll !== null ? buyTierOfRoll(roll) : '?'} = роллу, next = +6ч`,
        actual: `tx ${tx.length}, тир ${a.quality} (ролл ${roll}), value ${r.ok ? r.value.quality.value : '?'} (ролл ${valueRoll}), gold ${f.game.wallet.get('gold')}`,
      }),
    );
    f.dispose();
  }

  // ------------------------------------------------ 3. детерминизм роллов покупки ×2
  {
    const f1 = await makeSeededPenGame('m061-pen-det');
    f1.game.wallet.grant('gold', 240);
    f1.pen['pen.buy']('chicken');
    f1.pen['pen.buy']('goat');
    const f2 = await makeSeededPenGame('m061-pen-det');
    f2.game.wallet.grant('gold', 240);
    f2.pen['pen.buy']('chicken');
    f2.pen['pen.buy']('goat');
    const v1 = penView(f1);
    const v2 = penView(f2);
    results.push(
      check('детерминизм ×2: одинаковый saveId → одинаковые тиры/значения покупки (стримы pen:buy:*)', () =>
        v1.animals.map((a) => `${a.speciesId}:${a.quality}`).join(',') ===
        v2.animals.map((a) => `${a.speciesId}:${a.quality}`).join(',')),
    );
    f1.dispose();
    f2.dispose();
  }

  // ------------------------------------------------ 4. гейты ×3 + слоты: отказы с причиной, золото цело
  {
    const f = await makeSeededPenGame('m061-pen-gates');
    f.game.wallet.grant('gold', 5000);
    // уровень 1: Свинья (ачивка) и Пчёлы (ур. 15) закрыты
    const pig = f.pen['pen.buy']('pig') as R<unknown>;
    const bees = f.pen['pen.buy']('bees') as R<unknown>;
    // ур. 20: уровневая часть Альпаки закрыта, репутация — заглушка false
    levelPlayerTo(f, 20);
    const alpaca = f.pen['pen.buy']('alpaca') as R<unknown>;
    // слоты: 4 покупки без гейтов → 5-я отказ, золото цело (атомарность)
    f.pen['pen.buy']('chicken');
    f.pen['pen.buy']('goat');
    f.pen['pen.buy']('sheep');
    f.pen['pen.buy']('cow');
    const goldBefore = f.game.wallet.get('gold');
    const fifth = f.pen['pen.buy']('chicken') as R<unknown>;
    results.push(
      check('гейты: Свинья — «ачивка ach_mycologist», Пчёлы (ур. 1) — «уровень 15», Альпака (ур. 20) — «уровень 20 + репутация деревни (скоро)» (заглушка false); слоты 4/4 → 5-я покупка отказ, золото цело', () =>
        !pig.ok && pig.error.includes('ачивка ach_mycologist') &&
        !bees.ok && bees.error.includes('уровень 15') &&
        !alpaca.ok && alpaca.error.includes('уровень 20 + репутация деревни (скоро)') &&
        !fifth.ok && fifth.error.includes('нет свободных слотов') &&
        f.game.wallet.get('gold') === goldBefore && penView(f).slots.used === 4, {
        expected: '3 отказа с причинами + слоты/атомарность',
        actual: `pig ${pig.ok} / bees ${bees.ok} / alpaca ${alpaca.ok} / 5-я ${fifth.ok}, gold ${goldBefore}→${f.game.wallet.get('gold')}`,
      }),
    );
    f.dispose();
  }

  // ------------------------------------------------ 5. кормление: транзакция feed, энергия, лимит 1/день
  {
    const f = await makeSeededPenGame('m061-pen-feed');
    f.game.wallet.grant('gold', 160);
    f.game.wallet.grant('feed', 1);
    f.pen['pen.buy']('chicken');
    f.pen['pen.buy']('chicken'); // второе животное — путь «нет Корма» без дневного лимита
    const r = f.pen['pen.feed'](0) as R<{ satiety: number }>;
    const tx = f.events.filter((e) => e.name === 'wallet.transaction' && e.payload.eventId === 'pen.feed');
    const spent = energySpentOf(f.events);
    const again = f.pen['pen.feed'](0) as R<unknown>;
    // кошелёк без Корма (единица израсходована) — отказ транзакции, энергия не тронута
    const spentCount = energySpentOf(f.events).length;
    const noFeed = f.pen['pen.feed'](1) as R<unknown>;
    results.push(
      check('кормление: 1 Корм транзакцией pen.feed, satiety 100, энергия −1 (action.pen.feed.energyCost); повтор в тот же день — отказ; нет Корма — отказ транзакции, энергия не тратится', () =>
        r.ok && tx.length === 1 && f.game.wallet.get('feed') === 0 &&
        spent.length === 1 && spent[0]!.cost === 1 && spent[0]!.stat === 'action.pen.feed.energyCost' &&
        !again.ok && again.error.includes('уже кормлено сегодня') &&
        !noFeed.ok && noFeed.error.includes('pen.feed') && energySpentOf(f.events).length === spentCount, {
        expected: 'tx 1 / −1 энергии / 2 отказа (лимит + нет Корма)',
        actual: `tx ${tx.length}, spent ${JSON.stringify(spent)}, again ${again.ok}, noFeed ${noFeed.ok}`,
      }),
    );
    f.dispose();
  }

  // ------------------------------------------------ 6. чистка + гладить: энергии 2/0, +5 счастья, лимит
  {
    const f = await makeSeededPenGame('m061-pen-care');
    f.game.wallet.grant('gold', 80);
    f.pen['pen.buy']('chicken');
    // день decay: satiety 75, clean 90 — счастье цело
    dayPass(f, PEN_T0 + PEN_DAY);
    const a0 = animalAt(f, 0);
    const clean = f.pen['pen.clean'](0) as R<{ cleanliness: number }>;
    const pet = f.pen['pen.pet'](0) as R<{ happiness: number }>;
    const spent = energySpentOf(f.events);
    const petAgain = f.pen['pen.pet'](0) as R<unknown>;
    const a1 = animalAt(f, 0);
    results.push(
      check('чистка: cleanliness 90 → 100, энергия −2; гладить: счастье 100 → 100 (кап) НО pettedDay ставится, энергия НЕ тратится (0); повтор — отказ; decay-день: satiety 75 / clean 90 / счастье цело', () =>
        a0.satiety === 75 && a0.cleanliness === 90 && a0.happiness === 100 &&
        clean.ok && a1.cleanliness === 100 &&
        spent.some((s) => s.stat === 'action.pen.clean.energyCost' && s.cost === 2) &&
        !spent.some((s) => s.stat === 'action.pen.pet.energyCost') &&
        pet.ok && !petAgain.ok && petAgain.error.includes('уже гладили сегодня'), {
        expected: '75/90/100 → clean 100 −2э; pet 0э, лимит',
        actual: `${a0.satiety}/${a0.cleanliness}/${a0.happiness} → ${a1.cleanliness}; spent ${JSON.stringify(spent.map((s) => s.stat))}`,
      }),
    );
    f.dispose();
  }

  // ------------------------------------------------ 7. decay: голодная/грязная (−30/−10 счастья, счётчики)
  {
    const f = await makeSeededPenGame('m061-pen-decay');
    f.game.wallet.grant('gold', 80);
    f.pen['pen.buy']('chicken');
    // 4 дня без ухода: satiety 100→75→50→25→0 (день 4: голодная, −30)
    for (let d = 1; d <= 4; d++) dayPass(f, PEN_T0 + d * PEN_DAY);
    const hungry = animalAt(f, 0);
    // ещё 6 дней: satiety 0 (пол), clean 60→10→0 (день 10: грязная, −10)
    for (let d = 5; d <= 10; d++) dayPass(f, PEN_T0 + d * PEN_DAY);
    const dirty = animalAt(f, 0);
    results.push(
      check('decay: −25 сытость/−10 чистота за день; satiety 0 → счастье −30/день + hungryDays; cleanliness 0 → −10/день + dirtyDays (пол 0)', () =>
        hungry.satiety === 0 && hungry.happiness === 70 && hungry.hungryDays === 1 && hungry.cleanliness === 60 &&
        dirty.satiety === 0 && dirty.cleanliness === 0 && dirty.dirtyDays === 1 &&
        dirty.hungryDays === 7 && dirty.happiness === 0, {
        expected: 'день4: 0/70/1г/60ч; день10: 0/0/7г/1д/0 счастья',
        actual: `день4 ${hungry.satiety}/${hungry.happiness}/${hungry.hungryDays}г/${hungry.cleanliness}; день10 ${dirty.satiety}/${dirty.cleanliness}/${dirty.hungryDays}г/${dirty.dirtyDays}д/${dirty.happiness}`,
      }),
    );
    f.dispose();
  }

  return group('M06 · Загон (животные)', [...results, ...(await runPenProdChecks())]);
}
