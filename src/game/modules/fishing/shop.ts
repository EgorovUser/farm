/**
 * Покупка fish.buy (F2: прямая продажа из контент-дефов по прецеденту
 * pen.buy/pen.upgrade, БЕЗ энергии; НЕ товары пула M04 — полка «baits»
 * остаётся закрытой). TransactionService eventId 'fish.buy' (золото).
 *
 * Порядок (прецедент магазина M04.1): проба вместимости → оплата → выдача
 * (inventory.acquire, источник 'fishing') → удочке — стартовые ривен-роллы
 * M03 (modforge.rollItem именованным стримом `fish:rod:<defId>` — F4:
 * roll01-контракт П6, журнал + событие modforge.rolled с адресатом) →
 * inventory.setRolls. Наживки — без роллов (расходники без modSlots).
 *
 * Экипировка — НЕ здесь: покупка кладёт в рюкзак, надевает игрок
 * (inv equip <iid> rod|bait); витрина fish.state подсказывает.
 */
import type { TransactionService } from '@/kernel/services/transaction/transaction-service';
import type { SaveDirector } from '@/kernel/save/save-director';
import type { ID, QualityTier, Rarity } from '@/shared/types/ids';
import type { Result } from '@/shared/types/result';
import { err, ok } from '@/shared/types/result';
import type { RolledModEntry } from '@/shared/types/rolled-mod';
import type { RodShopDef } from '@/content/fishing/rods';
import type { BaitShopDef } from '@/content/fishing/baits';

export interface BuyReceipt {
  kind: 'rod' | 'bait';
  defId: ID;
  name: string;
  price: number;
  /** сколько единиц выдано (наживки — стак; удочки — всегда 1) */
  qty: number;
  /** созданная запись (удочки — носители ривен-роллов) */
  iid: ID;
  /** стартовые ривен-роллы удочки (журнал fish:rod:<defId>) */
  rolls: RolledModEntry[];
}

export interface ShopDeps {
  transaction: TransactionService;
  save: SaveDirector;
  rods: readonly RodShopDef[];
  baits: readonly BaitShopDef[];
  /** app-слой: inventory.acquire (D23) */
  acquire(defId: ID, qty: number, source: string): Result<{ quality: { tier: QualityTier; value: number }; iids: ID[] }>;
  /** app-слой: inventory.canAcquire — проба вместимости до оплаты */
  probeCapacity(defId: ID, qty: number): Result<{ fits: boolean; free: number; newEntries: number }>;
  /** app-слой: modforge.rollItem — стартовые роллы удочки (C4-прецедент) */
  rollItem(defId: ID, streamKey: string, target: { kind: 'item'; refId: ID }): Result<{ rolls: RolledModEntry[] }>;
  /** app-слой: inventory.setRolls — применение партии (C4) */
  applyRolls(iid: ID, rolls: RolledModEntry[]): Result<unknown>;
  /** app-слой: предмет-деф (имя для чека) */
  tryItem(defId: ID): { name: string; rarity: Rarity } | undefined;
}

export class FishingShop {
  private readonly d: ShopDeps;

  constructor(deps: ShopDeps) {
    this.d = deps;
  }

  /** покупка; [DECISION · M07.1] qty — только для наживок (стакающиеся
   *  расходники; живые серии забросов), удочки — по одной (уникальный тир) */
  buy(id: string, qty = 1): Result<BuyReceipt> {
    const rod = this.d.rods.find((r) => r.defId === id);
    const bait = this.d.baits.find((b) => b.defId === id);
    if (!rod && !bait) {
      return err(
        `«${id}» не рыболовный товар (fish.tables — каталог: удочки ${this.d.rods.map((r) => r.defId).join(', ')}; наживки ${this.d.baits.map((b) => b.defId).join(', ')})`,
      );
    }
    const kind: 'rod' | 'bait' = rod ? 'rod' : 'bait';
    const n = Math.floor(qty);
    if (n < 1) return err('количество должно быть целым и положительным');
    if (kind === 'rod' && n > 1) return err('удочки покупаются по одной (тир лестницы — уникальный снаряжения)');
    const price = rod ? rod.price : bait!.price;
    const name = this.d.tryItem(id)?.name ?? (rod ? rod.name : bait!.name);

    const probe = this.d.probeCapacity(id, n);
    if (!probe.ok) return err(probe.error);
    if (!probe.value.fits) {
      return err(`инвентарь полон: свободно слотов ${probe.value.free} — покупка отклонена`);
    }
    const pay = this.d.transaction.transact({
      costs: [{ t: 'currency', id: 'gold', qty: price * n }],
      eventId: 'fish.buy',
      reason: `покупка ${kind === 'rod' ? 'удочки' : 'наживки'} ${name}${n > 1 ? ` ×${n}` : ''}`,
    });
    if (!pay.ok) return err(pay.error);
    const grant = this.d.acquire(id, n, 'fishing');
    if (!grant.ok) {
      // emergency-предохранитель (прецедент shop.buy.refund): после зелёной
      // пробы теоретически неудачен — возврат золота компенсирующей транзакцией
      this.d.transaction.transact({
        grants: [{ t: 'currency', id: 'gold', qty: price * n }],
        eventId: 'fish.buy.refund',
        reason: 'аварийный возврат золота (выдача не удалась после зелёной пробы)',
      });
      return err(grant.error);
    }
    const iid = grant.value.iids[0] ?? '';
    let rolls: RolledModEntry[] = [];
    if (kind === 'rod' && iid) {
      // F4: ривен-роллы при создании инстанса — именованный стрим
      // fish:rod:<defId> (адресат — созданная запись; прецедент C4 магазина)
      const rolled = this.d.rollItem(id, `fish:rod:${id}`, { kind: 'item', refId: iid });
      if (rolled.ok) {
        rolls = rolled.value.rolls;
        const applied = this.d.applyRolls(iid, rolls);
        if (!applied.ok) return err(applied.error);
      } else {
        return err(rolled.error);
      }
    }
    return ok({ kind, defId: id, name, price, qty: n, iid, rolls });
  }
}
