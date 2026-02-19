
// Mock Context
const context = {
    user: 'testUser',
    userId: '123',
    channel: 'testChannel',
    broadcasterId: 'broadcaster123',
    count: 0,
    args: []
};

// Mock Service (Partial)
class MockVariableService {
    normalizeSyntax(input: string) {
        // Copy of logic from variable.service.ts
        if (!input) return '';
        let result = input;
        let iteration = 0;
        while (result.includes('${') && iteration < 10) {
            iteration++;
            result = result.replace(/\$\{([^{}]+)\}/g, (match, inner) => `$(${inner})`);
        }
        return result;
    }

    async resolveVariable(content: string) {
        const [cmd, ...args] = content.split(' ');
        const fullArgs = args.join(' ');
        const cmdLower = cmd.toLowerCase();

        // Copy of relevant switch cases
        switch (cmdLower) {
            case 'random.range':
            case 'random.number':
            case 'random':
                return 'RND_RESULT';
            default:
                // The Buggy Default
                return `$(unknown:${cmd})`;
        }
    }

    async parse(input: string) {
        let result = this.normalizeSyntax(input);
        let iteration = 0;
        const MAX_ITERATIONS = 5;

        while (result.includes('$(') && iteration < MAX_ITERATIONS) {
            iteration++;
            const match = result.match(/\$\(([^()]+)\)/);
            if (!match) break;

            const fullTag = match[0];
            const content = match[1].trim();

            // Check if we are stuck in a loop of unknowns
            if (content.startsWith('unknown:')) {
                console.log(`[Recursion Detected] ${content}`);
            }

            const value = await this.resolveVariable(content);
            console.log(`Iteration ${iteration}: Replaced ${fullTag} with ${value}`);
            result = result.replace(fullTag, value);
        }
        return result;
    }
}

async function run() {
    const service = new MockVariableService();
    const input = "$(random.1-100)%";
    console.log(`Input: ${input}`);
    const output = await service.parse(input);
    console.log(`Output: ${output}`);
}

run();
