'use client';

import { I18nProvider } from '@/lib/i18n/I18nProvider';
import { AuthProviders } from '@/components/AuthWidgets';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <AuthProviders>
      <I18nProvider>{children}</I18nProvider>
    </AuthProviders>
  );
}
