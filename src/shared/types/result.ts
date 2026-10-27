/**
 * Result — единый тип возврата для операций, которые могут отказать штатно.
 * 02-BUSES §9: транзакция «целиком или отказ» => Result.
 */

export interface Ok<T> {
  ok: true;
  value: T;
}

export interface Err<E = string> {
  ok: false;
  error: E;
}

export type Result<T, E = string> = Ok<T> | Err<E>;

export function ok<T>(value: T): Ok<T> {
  return { ok: true, value };
}

export function err<E>(error: E): Err<E> {
  return { ok: false, error };
}

/** Выполнить fn если r.ok, иначе пробросить ошибку дальше */
export function unwrap<T, E>(r: Result<T, E>): T {
  if (r.ok) return r.value;
  throw new Error(typeof r.error === 'string' ? r.error : JSON.stringify(r.error));
}
