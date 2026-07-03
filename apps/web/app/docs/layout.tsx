import type { Metadata } from 'next';
import { DocsLayoutClient } from '@/components/docs/DocsLayoutClient';

export const metadata: Metadata = {
  title: 'Documentation | Creator Castle',
  description: 'Guides and reference for Creator Castle chat commands, loyalty, and more.',
};

export default function DocsLayout({ children }: { children: React.ReactNode }) {
  return <DocsLayoutClient>{children}</DocsLayoutClient>;
}
