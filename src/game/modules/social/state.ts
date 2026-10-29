/**
 * Состояние M17 «Соц-заглушки» — срез `social`. [DECISION M171-срез]
 * (бриф §0): `{ v: 1, mailReadDay?: dateISO }` — ТОЛЬКО факт прочтения
 * писем; ленивая материализация при первом обращении; roundtrip
 * байт-в-байт; пост-wipe тишина; до обращения в файле чистой игры
 * ключа social НЕТ. SAVE_VERSION 15 не растёт (СЕМНАДЦАТАЯ заморозка
 * ядра; миграций НЕТ — ленивый срез без bump, прецеденты M13.x/M14/M16.x).
 *
 * Инварианты:
 *  - чтение витрин (board/mail/profile/state) НИЧЕГО не материализует:
 *    save() → undefined, пока mailReadDay не установлен;
 *  - `social.mail read` → mailReadDay = сегодня (маркер); повтор
 *    идемпотентен (та же запись); `social force` маркер НЕ трогает;
 *  - дев-рероллы social force — СЕАНСОВАЯ память модуля (в срез НЕ
 *    пишутся: после перезагрузки витрины дня возвращаются к базовому
 *    сиду — срез не расширяется сверх ратифицированного).
 */
import type { SaveSlice } from '@/kernel/save/save-director';

export interface SocialState {
  v: 1;
  mailReadDay?: string;
}

export function defaultSocialState(): SocialState {
  return { v: 1 };
}

/** «чист» ли срез: письма дня не помечались прочитанными → тишина файла */
export function isPristineSocial(s: SocialState): boolean {
  return s.mailReadDay === undefined;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** канонический порядок полей — roundtrip байт-в-байт */
export function canonicalSocialState(s: SocialState): SocialState {
  const day = typeof s.mailReadDay === 'string' && DATE_RE.test(s.mailReadDay) ? s.mailReadDay : undefined;
  return { v: 1, ...(day !== undefined ? { mailReadDay: day } : {}) };
}

/**
 * Срез сейва: чистые данные; save() → undefined для чистого среза
 * (до первого `social.mail read` ключ social НЕ пишется — «пост-wipe
 * тишина»; прецедент villageSaveSlice).
 */
export function socialSaveSlice(
  getState: () => SocialState,
  setState: (s: SocialState) => void,
): SaveSlice {
  return {
    save: () => {
      const s = getState();
      return isPristineSocial(s) ? undefined : canonicalSocialState(s);
    },
    load: (data: unknown) => {
      const s = data as SocialState | undefined;
      if (!s || typeof s !== 'object') {
        setState(defaultSocialState());
        return;
      }
      setState(canonicalSocialState(s));
    },
  };
}
