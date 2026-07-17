'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { apiUrl } from '@/lib/api';
import { LinksPageView, LinkItem, Owner, PageStyle } from '@/components/LinksPageView';

/**
 * Standalone public link-in-bio page — thin data wrapper around
 * LinksPageView (shared with the dashboard's live preview).
 * Share link is `/links/<streamerId>`.
 */
export default function PublicLinksPage() {
  const { streamerId } = useParams<{ streamerId: string }>();
  const [links, setLinks] = useState<LinkItem[]>([]);
  const [owner, setOwner] = useState<Owner | null>(null);
  const [style, setStyle] = useState<PageStyle | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!streamerId) return;
    fetch(apiUrl(`/api/links/public/${streamerId}`))
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        setLinks(Array.isArray(d?.links) ? d.links : []);
        setOwner(d?.owner ?? null);
        setStyle(d?.settings ?? null);
      })
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, [streamerId]);

  return (
    <div className="min-h-screen flex flex-col">
      <LinksPageView
        owner={owner}
        style={style}
        links={links}
        loading={loading}
        onLinkClick={(id) => {
          // keepalive so the beacon survives the navigation
          try { fetch(apiUrl(`/api/links/public/${streamerId}/click/${id}`), { method: 'POST', keepalive: true }); } catch { /* best effort */ }
        }}
      />
    </div>
  );
}
