/**
 * PassivesModule (M14.1) — движок пассивок: очки (события ×3 + идемпотентный
 * ретро), аллокация по рёбрам, платный респек (TransactionService eventId
 * passives.respec), провайдер выделенных узлов, витрины (карточка M14;
 * бриф SESSION-M14 F1–F7). Изоляция (01 §5–§7): модуль НЕ импортирует чужие
 * модули — факты сейва для ретро приходят колбэками app-слоя (deps.ts).
 *
 * [DECISION · skip-if-init] первая инициализация среза (ensureInit) считает
 * ретро по ФАКТАМ сейва (уровень + флаги боссов + «крупные» ачивки).
 * Внутри обработчиков player.levelUp / achievement.unlocked ретро УЖЕ
 * включает текущий факт (уровень повышен до публикации; ачивка в списке
 * открытых ДО публикации) — событие НЕ добавляет своё очко повторно.
 * mine.bossKilled НЕ пропускает: флаг ачивки босса открывается ПОЗЖЕ
 * события (трофей → item.acquired → auto-claim M15), ретро не мог посчитать
 * текущий килл.
 */
import type { GameModule, ModuleContext } from '@/game/module-registry';
import type { PassivesPointsTable, PassivesRespecTable, PassivesTree } from '@/content/passives/types';
import { respecCostOf } from '@/content/passives/respec';
import { createPassivesManifest } from './manifest';
import {
  defaultPassivesState,
  passivesSaveSlice,
  type PassivesState,
} from './state';
import {
  allocBlockReason,
  breaksConnectivity,
  buildTreeIndex,
  reachOf,
  retroPointsOf,
  type TreeIndex,
} from './logic';
import { makePassivesProvider } from './provider';
import { buildPointsView, buildTreeView } from './view';
import type { PassivesModuleDeps } from './deps';
import type { Result } from '@/shared/types/result';
import { err, ok } from '@/shared/types/result';

export interface AllocReceiptView {
  header: string;
  lines: string[];
}

export class PassivesModule implements GameModule {
  readonly manifest = createPassivesManifest();
  api: Record<string, (...args: unknown[]) => unknown> = {};
  private state: PassivesState = defaultPassivesState();
  private readonly deps: PassivesModuleDeps;
  /** ретро учтён (после load с ключом среза или первым ensureInit) */
  private initialized = false;
  /** витрина ретро текущего сеанса (честная строка «ретро-начислено N») */
  private retroInfo: { points: number; level: number; bosses: number; achievements: number } | null = null;
  private index: TreeIndex | null = null;
  private pointsTable: PassivesPointsTable | null = null;
  private respecTable: PassivesRespecTable | null = null;
  private markDirty: () => void = () => {};
  private bus: ModuleContext['bus'] | null = null;
  private transaction: ModuleContext['transaction'] | null = null;

  constructor(deps: PassivesModuleDeps) {
    this.deps = deps;
  }

  activate(ctx: ModuleContext): void {
    const { save, content, statBus, bus, transaction } = ctx;
    const tree = content.get<PassivesTree>('passives');
    this.pointsTable = content.get<PassivesPointsTable>('passives.points');
    this.respecTable = content.get<PassivesRespecTable>('passives.respec');
    this.index = buildTreeIndex(tree.nodes, tree.startNodes);
    this.bus = bus;
    this.transaction = transaction;
    this.markDirty = () => save.markDirty();

    save.registerSlice(
      'passives',
      passivesSaveSlice(
        () => this.state,
        (s) => {
          this.state = s;
          // load доставил данные среза → ретро уже вшит (ключ существовал)
          this.initialized = true;
        },
        this.index.nodesById,
        this.index.startNodes,
      ),
    );

    statBus.registerProvider(makePassivesProvider(() => this.state, this.index.nodesById));

    // подписки ×3 (манифест eventsSubscribed) — каналы очков
    bus.subscribe('player.levelUp', (p) => {
      this.onLevelUp(Number((p as { level?: unknown }).level ?? 0));
    });
    bus.subscribe('achievement.unlocked', (p) => {
      this.onAchievementUnlocked(String((p as { id?: unknown }).id ?? ''));
    });
    bus.subscribe('mine.bossKilled', () => {
      this.onBossKilled();
    });

    this.api = {
      'passives.state': () => {
        this.ensureInit();
        return buildPointsView(this.state, this.retroInfo && this.retroInfo.points > 0 ? { earned: true, ...this.retroInfo } : null, this.respecTable!);
      },
      'passives.tree': () => {
        this.ensureInit();
        return buildTreeView(this.index!, this.state);
      },
      'passives.alloc': (id: unknown): Result<AllocReceiptView> =>
        this.alloc(id === undefined ? '' : String(id)),
      'passives.refund': (id: unknown): Result<AllocReceiptView> =>
        this.refund(id === undefined ? '' : String(id)),
      'passives.canReach': (id: unknown): Result<AllocReceiptView> =>
        this.canReach(id === undefined ? '' : String(id)),
      // dev (бриф F7; прецеденты lake.force / workers.dev / mine.reveal)
      'passives.reset': (): AllocReceiptView => this.reset(),
    };
  }

  getState(): PassivesState {
    return this.state;
  }

  /** первая инициализация: ретро по фактам сейва; true = инициализировал СЕЙЧАС */
  private ensureInit(): boolean {
    if (this.initialized) return false;
    this.initialized = true;
    const retro = retroPointsOf(this.deps, this.pointsTable!);
    if (retro.points > 0) {
      this.state = { ...this.state, points: this.state.points + retro.points };
      this.markDirty();
    }
    this.retroInfo = retro;
    return true;
  }

  private onLevelUp(_level: number): void {
    const first = this.ensureInit();
    if (first) return; // ретро уже посчитал текущий уровень (ровно N)
    this.state = { ...this.state, points: this.state.points + this.pointsTable!.perLevel };
    this.markDirty();
  }

  private onAchievementUnlocked(id: string): void {
    const first = this.ensureInit();
    if (first) return; // ретро уже посчитал открытые ачивки (эта — в списке)
    const pts = this.pointsTable!.largeAchievements.find((a) => a.id === id)?.points ?? 0;
    if (pts > 0) {
      this.state = { ...this.state, points: this.state.points + pts };
      this.markDirty();
    }
  }

  private onBossKilled(): void {
    this.ensureInit();
    this.state = { ...this.state, points: this.state.points + this.pointsTable!.perBoss };
    this.markDirty();
  }

  private alloc(nodeId: string): Result<AllocReceiptView> {
    this.ensureInit();
    const index = this.index!;
    const block = allocBlockReason(index, this.state.allocated, nodeId);
    if (block !== null) return err(block);
    const node = index.nodesById.get(nodeId)!;
    const free = this.state.points - this.state.spent;
    if (node.cost > free) {
      return err(`не хватает очков: свободно ${free}, узел стоит ${node.cost} (passives points — витрина)`);
    }
    this.state = {
      ...this.state,
      spent: this.state.spent + node.cost,
      allocated: [...this.state.allocated, nodeId],
    };
    this.markDirty();
    // событие ×1 (каталог 02 §4) + сброс кэшей шины (канон: смена состояния)
    this.bus!.publish('passive.allocated', {
      nodeId,
      type: node.kind,
      name: node.name,
      effects: node.mods.map((m) => m.label ?? `${m.op} ${m.value} → ${m.stat}`),
    });
    this.bus!.publish('invalidate.stat', {});
    const after = this.state.points - this.state.spent;
    return ok({
      header: `Выделено: «${node.name}» (${nodeId})`,
      lines: [
        ...node.mods.map((m) => `эффект: ${m.label ?? `${m.op} ${m.value} → ${m.stat}`}`),
        `списано очков: ${node.cost} · свободно: ${after}`,
      ],
    });
  }

  private refund(arg: string): Result<AllocReceiptView> {
    this.ensureInit();
    const index = this.index!;
    if (arg === 'all') {
      if (this.state.allocated.length === 0) return err('выделений нет — нечего сбрасывать');
      const count = this.state.allocated.length;
      const cost = respecCostOf(this.respecTable!, this.state.respecTotal);
      const tx = this.transaction!.transact({
        costs: [{ t: 'currency', id: 'gold', qty: cost }],
        eventId: 'passives.respec',
        reason: `полный респек пассивок (${count} узлов)`,
      });
      if (!tx.ok) return err(`респек не оплачен: ${tx.error}`);
      this.state = { ...this.state, spent: 0, allocated: [], respecTotal: this.state.respecTotal + count };
      this.markDirty();
      this.bus!.publish('invalidate.stat', {});
      return ok({
        header: 'Полный респек: выделения сняты целиком',
        lines: [
          `снято узлов: ${count} · очки возвращены: ${this.state.points} свободно`,
          `уплачено: ${cost}з · сброшено всего: ${this.state.respecTotal} (кривая растёт)`,
        ],
      });
    }
    const node = index.nodesById.get(arg);
    if (node === undefined) return err(`неизвестный узел: ${arg} (passives tree — реестр узлов)`);
    if (!this.state.allocated.includes(arg)) return err('узел не выделен — сбрасывать нечего');
    if (breaksConnectivity(index, this.state.allocated, arg)) {
      return err(
        `узел-мост: снятие «${node.name}» разрывает связность остальных выделений со стартом (инвариант F4); полный сброс — passives refund all (разрешён всегда)`,
      );
    }
    const cost = respecCostOf(this.respecTable!, this.state.respecTotal);
    const tx = this.transaction!.transact({
      costs: [{ t: 'currency', id: 'gold', qty: cost }],
      eventId: 'passives.respec',
      reason: `респек узла ${arg}`,
    });
    if (!tx.ok) return err(`респек не оплачен: ${tx.error}`);
    this.state = {
      ...this.state,
      spent: this.state.spent - node.cost,
      allocated: this.state.allocated.filter((id) => id !== arg),
      respecTotal: this.state.respecTotal + 1,
    };
    this.markDirty();
    this.bus!.publish('invalidate.stat', {});
    return ok({
      header: `Респек: «${node.name}» (${arg}) снят`,
      lines: [
        `возвращено очков: ${node.cost} · свободно: ${this.state.points - this.state.spent}`,
        `уплачено: ${cost}з · сброшено всего: ${this.state.respecTotal} (кривая растёт)`,
      ],
    });
  }

  private canReach(nodeId: string): Result<AllocReceiptView> {
    this.ensureInit();
    const index = this.index!;
    const node = index.nodesById.get(nodeId);
    if (node === undefined) return err(`неизвестный узел: ${nodeId} (passives tree — реестр узлов)`);
    const reach = reachOf(index, this.state.allocated, nodeId);
    const lines: string[] = [];
    if (reach.allocated) lines.push('узел уже выделен');
    else if (index.startNodes.has(nodeId)) lines.push('старт-узел: активен всегда, выделения не требует');
    else if (reach.reachable) {
      lines.push(`достижим: ${reach.distance} выделений по рёбрам от (старт ∪ выделенные)`);
      const free = this.state.points - this.state.spent;
      lines.push(free >= node.cost ? `можно выделить: цена ${node.cost} (свободно ${free})` : `цена ${node.cost} — не хватает очков (свободно ${free})`);
    } else lines.push('недостижим (висячий узел — валидный контент этого не допускает)');
    return ok({ header: `Достижимость «${node.name}» (${nodeId})`, lines });
  }

  /** dev (F7): полный сброс БЕЗ золота; ретро этого сеанса не перезапускается */
  private reset(): AllocReceiptView {
    this.state = defaultPassivesState();
    this.initialized = true;
    this.retroInfo = null;
    this.markDirty();
    this.bus!.publish('invalidate.stat', {});
    return {
      header: 'Пассивки сброшены (dev, без золота)',
      lines: [
        'очки/выделения/respecTotal обнулены; провайдер больше не даёт модификаторов',
        'после перезагрузки ретро пересчитается по фактам сейва (уровень/боссы/ачивки)',
      ],
    };
  }
}
