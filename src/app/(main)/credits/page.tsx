import { Suspense } from 'react';
import { CreditsPanel } from '@/components/CreditsPanel';

export default function CreditsPage() {
  return (
    <Suspense fallback={null}>
      <CreditsPanel />
    </Suspense>
  );
}
