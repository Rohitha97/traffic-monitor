import type { Locale } from '@/i18n/locale';

import type messages from './messages/en.json';

/*
 * Type-safe message keys.
 *
 * With this augmentation `t('statusBar.connection.criticaI')` is a build error
 * rather than the literal key rendering as text on a control-room screen at
 * 3am. English is the reference shape; `scripts/check-messages.mjs` holds the
 * other locales to it at lint time, which is the half TypeScript cannot see.
 */
declare module 'next-intl' {
  interface AppConfig {
    Locale: Locale;
    Messages: typeof messages;
  }
}
