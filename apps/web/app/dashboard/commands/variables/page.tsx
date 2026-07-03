import { redirect } from 'next/navigation';

export default function LegacyVariablesRedirect() {
  redirect('/docs/variables');
}
