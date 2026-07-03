/** Dev-only auth bypass — never enabled in production. Set DEV_SKIP_AUTH=false to disable locally. */
export function isDevSkipAuth(): boolean {
  if (process.env.NODE_ENV === 'production') return false;
  if (process.env.DEV_SKIP_AUTH === 'false') return false;
  return true;
}

export const DEV_USER = {
  id: process.env.DEV_USER_ID || 'c2b3c127-3611-421d-8194-a35313090986',
  twitchId: process.env.DEV_TWITCH_ID || '96085876',
  username: process.env.DEV_USERNAME || 'codeoce',
};
