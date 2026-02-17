import { Injectable } from '@nestjs/common';

@Injectable()
export class VariableParserService {
    /**
     * Convert Nightbot variables to our syntax
     * Nightbot uses $(variable) format
     */
    parseNightbotVariables(text: string): string {
        if (!text) return text;

        let result = text;

        // User variables
        result = result.replace(/\$\(user\)/gi, '@{user}');
        result = result.replace(/\$\(touser\)/gi, '@{args[0]}');

        // Query and arguments
        result = result.replace(/\$\(query\)/gi, '{args}');
        result = result.replace(/\$\(querystring\)/gi, '{args}');

        // Count
        result = result.replace(/\$\(count\)/gi, '{count}');

        // Channel
        result = result.replace(/\$\(channel\)/gi, '{channel}');

        // API calls - urlfetch and customapi
        result = result.replace(/\$\(urlfetch\s+([^)]+)\)/gi, '{api:$1}');
        result = result.replace(/\$\(customapi\s+([^)]+)\)/gi, '{api:$1}');

        // Time variables
        result = result.replace(/\$\(time\s+([^)]+)\)/gi, '{time:$1}');

        // Target user (for commands like !hug @user)
        result = result.replace(/\$\(1\)/gi, '{args[0]}');
        result = result.replace(/\$\(2\)/gi, '{args[1]}');
        result = result.replace(/\$\(3\)/gi, '{args[2]}');

        return result;
    }

    /**
     * Convert StreamElements variables to our syntax
     * StreamElements uses ${variable} format
     */
    parseStreamElementsVariables(text: string): string {
        if (!text) return text;

        let result = text;

        // Complex structures - must come FIRST
        result = result.replace(/\$\{if\s+/gi, '$(if ');
        result = result.replace(/\$\{urlfetch\s+/gi, '$(urlfetch ');

        // User variables
        result = result.replace(/\$\{user\}/gi, '$(user)');
        result = result.replace(/\$\{user\.name\}/gi, '$(user)');
        result = result.replace(/\$\{sender\}/gi, '$(user)');

        // Positional arguments
        result = result.replace(/\$\{1\}/g, '$(1)');
        result = result.replace(/\$\{2\}/g, '$(2)');
        result = result.replace(/\$\{3\}/g, '$(3)');
        result = result.replace(/\$\{4\}/g, '$(4)');
        result = result.replace(/\$\{5\}/g, '$(5)');

        // Query string
        result = result.replace(/\$\{querystring\}/gi, '$(query)');
        result = result.replace(/\$\{query\}/gi, '$(query)');

        // Count
        result = result.replace(/\$\{count\}/gi, '$(count)');
        result = result.replace(/\$\{counter\}/gi, '$(count)');

        // Channel
        result = result.replace(/\$\{channel\}/gi, '$(channel)');
        result = result.replace(/\$\{channel\.name\}/gi, '$(channel)');

        // API calls - convert to modern $(urlfetch) format
        result = result.replace(/\$\{customapi\.([^}]+)\}/gi, '$(urlfetch $1)');
        result = result.replace(/\$\{urlfetch\s+([^}]+)\}/gi, '$(urlfetch $1)');

        // Target user
        result = result.replace(/\$\{touser\}/gi, '$(touser)');

        // Final cleanup: convert any remaining ${...} to $(...)
        result = result.replace(/\$\{/g, '$(');
        result = result.replace(/\}/g, ')');

        return result;
    }

    /**
     * Auto-detect and parse variables from either platform
     */
    parseVariables(text: string, platform: 'nightbot' | 'streamelements'): string {
        if (platform === 'nightbot') {
            return this.parseNightbotVariables(text);
        } else {
            return this.parseStreamElementsVariables(text);
        }
    }

    /**
     * Get a summary of variable conversions for preview
     */
    getConversionSummary(originalText: string, platform: 'nightbot' | 'streamelements'): Array<{ from: string; to: string }> {
        const conversions: Array<{ from: string; to: string }> = [];
        const parsed = this.parseVariables(originalText, platform);

        if (platform === 'nightbot') {
            const nightbotVars = originalText.match(/\$\([^)]+\)/g) || [];
            nightbotVars.forEach(varMatch => {
                const converted = this.parseNightbotVariables(varMatch);
                if (converted !== varMatch) {
                    conversions.push({ from: varMatch, to: converted });
                }
            });
        } else {
            const seVars = originalText.match(/\$\{[^}]+\}/g) || [];
            seVars.forEach(varMatch => {
                const converted = this.parseStreamElementsVariables(varMatch);
                if (converted !== varMatch) {
                    conversions.push({ from: varMatch, to: converted });
                }
            });
        }

        return conversions;
    }
}
