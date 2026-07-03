export type VariableExample = {
  label?: string;
  input: string;
  output: string;
};

export type VariableDoc = {
  id: string;
  name: string;
  category: 'User' | 'Channel & stream' | 'Input & args' | 'Counters' | 'Random' | 'External data' | 'Import' | 'Not supported';
  summary: string;
  overview: string;
  usage?: string;
  note?: string;
  parameters?: string;
  aliases?: string[];
  examples: VariableExample[];
  supported: boolean;
};

export const VARIABLE_CATEGORIES: VariableDoc['category'][] = [
  'User',
  'Channel & stream',
  'Input & args',
  'Counters',
  'Random',
  'External data',
  'Import',
  'Not supported',
];

export const COMMAND_VARIABLE_DOCS: VariableDoc[] = [
  {
    id: 'user',
    name: '$(user)',
    category: 'User',
    summary: 'Display name of the chatter who ran the command.',
    overview:
      'Returns the Twitch display name of whoever triggered the command. This is the most common variable for personalizing responses.',
    usage: 'Use without arguments to reference the command sender.',
    aliases: ['$(sender)', '$(source)', '{user}'],
    examples: [
      { input: 'Welcome $(user)!', output: 'Welcome CreatorCastleGG!' },
      { input: '$(user) rolled $(random 1-6)', output: 'CreatorCastleGG rolled 4' },
    ],
    supported: true,
  },
  {
    id: 'userid',
    name: '$(userid)',
    category: 'User',
    summary: 'Twitch user ID of the command sender.',
    overview: 'Returns the numeric Twitch ID for the chatter who ran the command.',
    aliases: ['$(user.id)'],
    examples: [{ input: 'Your ID is $(userid)', output: 'Your ID is 12345678' }],
    supported: true,
  },
  {
    id: 'touser',
    name: '$(touser)',
    category: 'User',
    summary: 'First argument after the command, or the sender if empty.',
    overview:
      'Typically the @mentioned user or first word after the trigger. Falls back to the command sender when no extra words were typed.',
    usage: 'Great for hug/love/roast commands that target another viewer.',
    aliases: ['{touser}'],
    examples: [
      { input: '!hug @CastleTCG → $(user) hugs $(touser)!', output: 'CreatorCastleGG hugs CastleTCG!' },
      { input: '!hug (no args) → $(user) hugs $(touser)!', output: 'CreatorCastleGG hugs CreatorCastleGG!' },
    ],
    supported: true,
  },
  {
    id: 'touserid',
    name: '$(touserid)',
    category: 'User',
    summary: 'Twitch ID of the mentioned user, or the sender.',
    overview: 'Resolves the first argument to a Twitch user ID. Uses the sender ID when no target is provided.',
    examples: [{ input: 'Target ID: $(touserid)', output: 'Target ID: 87654321' }],
    supported: true,
  },
  {
    id: 'followage',
    name: '$(followage)',
    category: 'User',
    summary: 'How long a user has followed the channel.',
    overview: 'Looks up follow duration for the sender or an optional @username argument.',
    parameters: 'Optional login: $(followage @viewer)',
    examples: [
      { input: '$(user) has followed for $(followage)', output: 'CreatorCastleGG has followed for 142 days' },
      { input: '$(followage @CreatorCastleGG)', output: '89 days' },
    ],
    supported: true,
  },
  {
    id: 'watchtime',
    name: '$(watchtime)',
    category: 'User',
    summary: 'Total watch time in your channel.',
    overview: 'Shows loyalty watch time tracked by Creator Castle for the sender or a specified user.',
    aliases: ['$(user.time_online)'],
    parameters: 'Optional login: $(watchtime @viewer)',
    examples: [
      { input: '$(user) has watched for $(watchtime)', output: 'CreatorCastleGG has watched for 2h 15m' },
    ],
    supported: true,
  },
  {
    id: 'channel',
    name: '$(channel)',
    category: 'Channel & stream',
    summary: 'Your channel login name (no #).',
    overview: 'The broadcaster channel login where the command was run.',
    aliases: ['{channel}'],
    examples: [{ input: 'Follow $(channel) on Twitch!', output: 'Follow CreatorCastleGG on Twitch!' }],
    supported: true,
  },
  {
    id: 'uptime',
    name: '$(uptime)',
    category: 'Channel & stream',
    summary: 'How long the current stream has been live.',
    overview: 'Returns formatted uptime while live, or the word "offline" when the stream is not live.',
    aliases: ['$(uptimelength)'],
    examples: [
      { input: 'Stream has been live for $(uptime)', output: 'Stream has been live for 3h 42m' },
      { input: '$(uptime) (offline)', output: 'offline' },
    ],
    supported: true,
  },
  {
    id: 'game',
    name: '$(game)',
    category: 'Channel & stream',
    summary: 'Current game or category on Twitch.',
    overview: 'Reads the channel category from Twitch. Optionally pass another channel login.',
    parameters: 'Optional channel: $(game @CreatorCastleGG)',
    examples: [
      { input: 'Now playing $(game)', output: 'Now playing VALORANT' },
      { input: '$(game @CreatorCastleGG)', output: 'Just Chatting' },
    ],
    supported: true,
  },
  {
    id: 'title',
    name: '$(title)',
    category: 'Channel & stream',
    summary: 'Current stream title.',
    overview: 'Returns the live stream title from Twitch channel metadata.',
    parameters: 'Optional channel: $(title @CreatorCastleGG)',
    examples: [{ input: 'Title: $(title)', output: 'Title: Chill vibes only' }],
    supported: true,
  },
  {
    id: 'weather',
    name: '$(weather)',
    category: 'Channel & stream',
    summary: 'Current weather for a location.',
    overview: 'Fetches a short weather summary via wttr.in. Location text is everything after the variable name.',
    parameters: 'Required location: $(weather London)',
    examples: [{ input: '$(weather Sydney)', output: 'Sydney: ☀️ +22°C' }],
    supported: true,
  },
  {
    id: 'query',
    name: '$(query)',
    category: 'Input & args',
    summary: 'Everything typed after the command trigger.',
    overview: 'Joins all arguments into one string — useful for open-ended commands.',
    aliases: ['$(args)'],
    examples: [
      { input: '!say hello world → You said: $(query)', output: 'You said: hello world' },
    ],
    supported: true,
  },
  {
    id: 'positional',
    name: '$(1) $(2) $(1:)',
    category: 'Input & args',
    summary: 'Positional arguments after the trigger.',
    overview:
      '$(1) is the first word, $(2) the second, and $(1:) is everything from the first argument onward. $(1) defaults to the sender name when empty.',
    examples: [
      { input: '!duel @CreatorCastleGG 100 → $(1) vs $(2) for $(3)', output: 'CreatorCastleGG vs 100 for …' },
      { input: '!echo $(1:)', output: 'Repeats all args from position 1' },
    ],
    supported: true,
  },
  {
    id: 'count',
    name: '$(count)',
    category: 'Counters',
    summary: 'How many times this command has been used.',
    overview: 'Increments when the command runs, then returns the new total for the triggering command.',
    aliases: ['{count}'],
    examples: [
      { input: 'This command has been used $(count) times', output: 'This command has been used 42 times' },
    ],
    supported: true,
  },
  {
    id: 'getcount',
    name: '$(getcount)',
    category: 'Counters',
    summary: 'Usage count of another command without incrementing.',
    overview: 'Pass a trigger name to read how many times a different command has been used.',
    parameters: 'Trigger name: $(getcount deaths)',
    examples: [{ input: 'Deaths: $(getcount deaths)', output: 'Deaths: 12' }],
    supported: true,
  },
  {
    id: 'random',
    name: '$(random)',
    category: 'Random',
    summary: 'Random number or pick from a list.',
    overview:
      'Generate a random integer in a range, or pick one option from quoted strings. Dotted range syntax $(random.1-100) from imports is also supported.',
    usage: '$(random 1-100) · $(random.1-100) · $(random.pick "Yes" "No")',
    examples: [
      { label: 'Range', input: 'Roll: $(random 1-20)', output: 'Roll: 14' },
      { label: 'Pick', input: '$(random.pick "Heads" "Tails")', output: 'Tails' },
    ],
    supported: true,
  },
  {
    id: 'import-syntax',
    name: '${…}',
    category: 'Import',
    summary: 'Legacy ${variable} syntax is auto-converted on import.',
    overview:
      'When you import commands or paste legacy-format responses, ${user} and similar tags are normalized to $(user) automatically.',
    examples: [
      { input: '${user} in ${channel.name}', output: 'Stored as $(user) in $(channel)' },
    ],
    supported: true,
  },
  {
    id: 'eval',
    name: '$(eval)',
    category: 'Not supported',
    summary: 'JavaScript evaluation is disabled for security.',
    overview:
      'Some bots allow running arbitrary JavaScript inside commands. Creator Castle does not support this in the multi-tenant worker environment.',
    examples: [{ input: '$(eval …)', output: '[eval is not supported]' }],
    supported: false,
  },
  {
    id: 'urlfetch',
    name: '$(urlfetch)',
    category: 'External data',
    summary: 'Fetch a URL and print its response in chat.',
    overview:
      'GETs an http(s) URL and inserts the plain-text response (collapsed to one line, max 400 characters). Works with the popular community command APIs, so most imported commands using it run unchanged. Other variables inside the URL resolve first.',
    parameters: 'Required URL: $(urlfetch https://api.example.com/text)',
    aliases: ['$(customapi …)'],
    examples: [
      {
        input: '!hug → $(urlfetch https://api.example.com/hug?to=$(touser))',
        output: 'CreatorCastleGG gets a big warm hug!',
      },
    ],
    supported: true,
  },
  {
    id: 'math',
    name: '$(math)',
    category: 'Not supported',
    summary: 'Inline math evaluation is not supported.',
    overview: 'Use $(random) for dice rolls instead. Math expressions from imported bots will not evaluate.',
    examples: [{ input: '$(math 1+1)', output: 'Not resolved' }],
    supported: false,
  },
];
