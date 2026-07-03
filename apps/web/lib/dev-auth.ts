import { apiUrl } from './api';

/** Local dev user — matches codeoce in dev.db / users.txt */
export const DEV_USER = {
  id: 'c2b3c127-3611-421d-8194-a35313090986',
  tenantId: 'c2b3c127-3611-421d-8194-a35313090986',
  twitchId: '96085876',
  twitch_id: '96085876',
  username: 'codeoce',
  displayName: 'codeoce',
  avatar: 'https://static-cdn.jtvnw.net/jtv_user_pictures/96085876-profile_image-70x70.png',
  avatarUrl: 'https://static-cdn.jtvnw.net/jtv_user_pictures/96085876-profile_image-70x70.png',
  tenantName: 'codeoce',
  isConnected: true,
  is_creator: true,
} as const;

/** True in local dev unless explicitly disabled with NEXT_PUBLIC_DEV_SKIP_AUTH=false */
export function isDevSkipAuth(): boolean {
  if (process.env.NEXT_PUBLIC_DEV_SKIP_AUTH === 'false') return false;
  if (process.env.NEXT_PUBLIC_DEV_SKIP_AUTH === 'true') return true;
  return process.env.NODE_ENV === 'development';
}

/** Fetch /api/user/me, or return the dev mock when skip-auth is on. Never redirects. */
export async function fetchCurrentUser(): Promise<typeof DEV_USER | Record<string, unknown> | null> {
  if (isDevSkipAuth()) {
    try {
      const res = await fetch(apiUrl('/api/user/me'), { credentials: 'include' });
      if (res.ok) return res.json();
    } catch {
      /* API offline — use mock */
    }
    return { ...DEV_USER };
  }
  try {
    const res = await fetch(apiUrl('/api/user/me'), { credentials: 'include' });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}
