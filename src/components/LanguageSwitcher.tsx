'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useTransition } from 'react';

import { Button } from '@/components/Button';
import { localeCookie, type Locale } from '@/i18n/locale';

/*
 * The workstation's language, in the status bar beside the mute toggle.
 *
 * Both are the same kind of thing — a property of the desk that persists across
 * shifts and belongs to whoever is sitting at it, not to the incident on
 * screen. Putting them together says that without a settings dialog.
 *
 * Writing the cookie and calling `router.refresh()` re-renders the whole tree
 * on the server in the new locale. The alternative — reloading the page —
 * would drop the SSE connection and the queue with it, so an operator changing
 * language would watch their screen empty and refill.
 */

/** Two locales, so a toggle rather than a menu. Grows into a select at three. */
export function LanguageSwitcher() {
  const t = useTranslations('language');
  const active = useLocale();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const next: Locale = active === 'en' ? 'ja' : 'en';

  return (
    <Button
      size="xs"
      /*
       * The button shows the language it switches *to*, in that language.
       * Endonyms always — a switcher that offers "Japanese" to someone who
       * cannot read English is offering nothing.
       */
      aria-label={`${t('label')}: ${t(next)}`}
      lang={next}
      disabled={pending}
      onClick={() => {
        document.cookie = localeCookie(next);
        startTransition(() => router.refresh());
      }}
    >
      {t(next)}
    </Button>
  );
}
