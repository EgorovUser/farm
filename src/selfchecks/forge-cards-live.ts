/**
 * Живые пробы M10.2 «Карточки» (заморозка/восстановление, edge отказа,
 * события + паритет манифеста R6) — вынесено из forge-cards-checks.ts
 * (расщепление 01 §6: файл превысил целевой коридор новых файлов).
 */
import { check, type CheckResult } from './types';
import { createForgeManifest } from '@/game/modules/forge/manifest';
import {
  attempt,
  autoCards,
  backpack,
  firstIid,
  force,
  forgeCard,
  setupSharpenable,
  type ForgeFixture,
} from './forge-fixture';

export async function runForgeCardsLiveChecks(): Promise<CheckResult[]> {
  const results: CheckResult[] = [];
  // ------------------------------------------- 5. заморозка/восстановление
  {
    const { f, iid } = await setupSharpenable('m102-freeze');
    force(f, 'success');
    const up = attempt(f, iid); // L1 + auto-карточка
    force(f, 'rollback');
    const back = attempt(f, iid); // откат L1→L0: карточка заморожена
    force(f, 'off');
    const recAfterBack = backpack(f).find((i) => i.iid === iid);
    const cardEventsBefore = f.events.filter((e: { name: string }) => e.name === 'modforge.rolled' || e.name === 'forge.levelUp').length;
    force(f, 'success');
    const again = attempt(f, iid); // L1 снова: восстановление
    const cardEventsAfter = f.events.filter((e: { name: string }) => e.name === 'modforge.rolled' || e.name === 'forge.levelUp').length;
    const rec = backpack(f).find((i) => i.iid === iid);
    results.push(
      check('заморозка: откат L1→L0 заморозил карточку (изъята из rolledMods, frozen=true)', () =>
        up.ok && up.value.cards?.chosen !== null &&
        back.ok && back.value.outcome === 'rollback' && back.value.frozen === true &&
        recAfterBack !== undefined && (recAfterBack.rolledMods ?? []).filter((m) => m.from === 'forge').length === 0),
    );
    results.push(
      check('восстановление: повторное достижение L1 верноло ТУ ЖЕ карточку (байт-в-байт) БЕЗ новых роллов', () => {
        if (!again.ok || again.value.cards === null || !up.ok || up.value.cards?.chosen === null) return false;
        const chosen = again.value.cards.chosen;
        // новых modforge.rolled между откатом и повтором НЕТ (только forge.levelUp,
        // offered=false при восстановлении)
        const againLevelUp = f.events.filter((e: { name: string }) => e.name === 'forge.levelUp');
        const lastLevelUp = againLevelUp[againLevelUp.length - 1];
        void rec;
        return (
          again.value.cards.restored === true &&
          JSON.stringify(chosen) === JSON.stringify(up.value.cards?.chosen) &&
          cardEventsAfter === cardEventsBefore + 1 &&
          lastLevelUp !== undefined && lastLevelUp.payload.restored === true
        );
      }),
    );
    f.dispose();
  }

  // ------------------------------------------- 6. edge: откат уровня с отказом — замораживать нечего
  {
    const { f, iid } = await setupSharpenable('m102-edge');
    autoCards(f, 'off');
    force(f, 'success');
    const up = attempt(f, iid); // L1, предложение
    forgeCard(f, 'decline', iid); // отказ: карточки уровня 1 нет
    force(f, 'rollback');
    const back = attempt(f, iid); // откат L1→L0 — замораживать нечего
    force(f, 'success');
    const again = attempt(f, iid); // L1 снова — СВЕЖЕЕ предложение (не восстановление)
    force(f, 'off');
    results.push(
      check('edge: откат уровня с отказом — frozen=false; повторное достижение предлагает СВЕЖИЕ карточки', () =>
        up.ok && back.ok && back.value.frozen === false &&
        again.ok && again.value.cards !== null &&
        again.value.cards.restored === false && again.value.cards.offered === true),
    );
    f.dispose();
  }

  // ------------------------------------------- 7. события levelUp/cardChosen + паритет манифеста (R6)
  {
    const { f, iid } = await setupSharpenable('m102-events');
    force(f, 'success');
    const a = attempt(f, iid);
    force(f, 'off');
    const levelUps = f.events.filter((e: { name: string }) => e.name === 'forge.levelUp');
    const chosen = f.events.filter((e) => e.name === 'forge.cardChosen');
    results.push(
      check('события §5: forge.levelUp {iid, level, restored, offered} + forge.cardChosen {iid, defId, level, card, declined, budget} — полные данные', () => {
        if (!a.ok) return false;
        const lu = levelUps[levelUps.length - 1];
        const cc = chosen[chosen.length - 1];
        return (
          lu !== undefined && lu.payload.level === 1 && lu.payload.offered === true && lu.payload.restored === false &&
          cc !== undefined && cc.payload.level === 1 && cc.payload.declined === false &&
          typeof cc.payload.budget === 'number' && Array.isArray(cc.payload.card) &&
          typeof cc.payload.defId === 'string'
        );
      }),
    );
    results.push(
      check('паритет манифеста forge (R6): publicApi 11 = 11 фактических; eventsPublished 5 = 5 живых', () => {
        const apiKeys = new Set(Object.keys(f.game.modules.get('forge')?.api ?? {}));
        const manifest = createForgeManifest();
        const manifestKeys = new Set(manifest.publicApi as string[]);
        const published = manifest.eventsPublished ?? [];
        const liveEvents = new Set(['forge.attempt', 'forge.success', 'forge.rollback', 'forge.levelUp', 'forge.cardChosen']);
        if (apiKeys.size !== manifestKeys.size) return false;
        for (const k of manifestKeys) if (!apiKeys.has(k)) return false;
        return published.length === 5 && published.every((e) => liveEvents.has(e)) && apiKeys.size === 11;
      }),
    );
    f.dispose();
  }

  return results;
}
