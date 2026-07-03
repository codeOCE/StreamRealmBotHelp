'use client';

import { usePathname } from 'next/navigation';
import { DocsShell } from './DocsShell';

export function DocsLayoutClient({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return <DocsShell pathname={pathname}>{children}</DocsShell>;
}
