import type { Metadata } from 'next';
import { VariablesReference } from '@/components/docs/VariablesReference';

export const metadata: Metadata = {
  title: 'Variables | Creator Castle Docs',
  description: 'Chat command variable reference — $(user), $(channel), counters, random values, and import aliases.',
};

export default function VariablesDocPage() {
  return <VariablesReference />;
}
