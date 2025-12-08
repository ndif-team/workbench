/**
 * Mock dotenv for Storybook browser environment
 * The real dotenv uses process.cwd() which doesn't exist in browsers
 */

export function config() {
    // No-op in browser
    return { parsed: {} };
}

export function parse() {
    return {};
}

export const configDotenv = config;

export default {
    config,
    parse,
    configDotenv,
};
