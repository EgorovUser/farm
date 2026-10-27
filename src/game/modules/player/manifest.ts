/**
 * Манифест M01 (01-CORE §9): единственное место, где модуль декларирует
 * ВСЕ точки интеграции. Идёт по карточке §7: события player.*, skill.levelUp;
 * провайдеры skillProvider и levelBonusProvider; API player.spendEnergy /
 * player.checkHp / player.addXp / skills.get. eventsSubscribed строится
 * из данных (XP-таблица + манифест подписок навыков + счётчики).
 */
import type { ModuleManifest } from '@/game/module-registry';
import type { PlayerTable } from '@/content/player/progression';
import type { SkillDef } from '@/content/player/skills';
import type { CounterDef } from '@/content/player/counters';

export function createPlayerManifest(
  table: PlayerTable,
  skills: readonly SkillDef[],
  counters: readonly CounterDef[],
): ModuleManifest {
  const skillEvents = skills.flatMap((s) => s.xpEvents.map((r) => r.event));
  const counterEvents = counters.map((c) => c.event);
  const eventsSubscribed = [
    ...new Set([
      'time.minuteTick',
      'time.catchUpDone',
      ...table.xpEvents.map((r) => r.event),
      ...skillEvents,
      ...counterEvents,
    ]),
  ].map((event) => ({ event, handler: event.startsWith('time.') ? event : 'onGameDataEvent' }));

  return {
    id: 'player',
    title: 'M01 Игрок',
    version: '1.0.0',
    stateKey: 'player',
    publicApi: [
      'player.snapshot',
      'player.spendEnergy',
      'player.withEnergy',
      'player.grantEnergy',
      // [M02.3 · D33] грант HP для useAction M02 (зеркально grantEnergy);
      // healHp/damageHp остаются от M01 (debug/бой) — тот же сервисный путь
      'player.grantHp',
      'player.setEnergy',
      'player.setHp',
      'player.energyCost',
      'player.checkHp',
      'player.damageHp',
      'player.healHp',
      'player.addXp',
      'player.ctxExtras',
      'skills.get',
      'skills.list',
      'skills.addXp',
    ],
    eventsPublished: [
      'player.energySpent',
      'player.energyChanged',
      'player.hpChanged',
      'player.xpGained',
      'player.levelUp',
      'skill.xpGained',
      'skill.levelUp',
    ],
    eventsSubscribed,
    modifierProviders: ['player.skills', 'player.levelBonus'],
    statsCounters: counters.map((c) => c.id),
  };
}
