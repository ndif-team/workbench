/**
 * Google Colab Authentication Setup
 *
 * Run this script once to log in to Google and save the auth state.
 * The saved state can then be used for automated Colab tests.
 *
 * This uses real Chrome (not Chromium) with a persistent profile to avoid
 * Google's "This browser may not be secure" error.
 *
 * Usage:
 *   ./scripts/test.sh colab:setup
 *   # Or: npx playwright test tests/browser/colab-auth-setup.spec.js --headed
 *
 * After running:
 *   - A Chrome window will open
 *   - Log in to your Google account
 *   - The script will save the auth state to .auth/google-state.json
 *   - This file should NOT be committed to git (it contains session cookies)
 */

import { test, chromium } from '@playwright/test';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const AUTH_FILE = path.join(__dirname, '../../.auth/google-state.json');
const USER_DATA_DIR = path.join(__dirname, '../../.auth/chrome-profile');

// Give user 5 minutes to sign in
test.setTimeout(300000);

// Only run on chromium - we need real Chrome for Google login
test.skip(({ browserName }) => browserName !== 'chromium', 'Google auth setup only works with Chrome');

test('setup Google authentication for Colab tests', async () => {
    // Create auth directory if it doesn't exist
    const authDir = path.dirname(AUTH_FILE);
    if (!fs.existsSync(authDir)) {
        fs.mkdirSync(authDir, { recursive: true });
    }

    console.log('');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('  GOOGLE COLAB AUTHENTICATION SETUP');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('');
    console.log('  A Chrome window will open.');
    console.log('  Please sign in to your Google account.');
    console.log('  You have 5 minutes to complete sign-in.');
    console.log('');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('');

    // Use real Chrome with a persistent profile to avoid "browser not secure" error
    // Google blocks automated Chromium but typically allows real Chrome
    let context;
    try {
        context = await chromium.launchPersistentContext(USER_DATA_DIR, {
            headless: false,
            channel: 'chrome',  // Use installed Chrome, not Chromium
            args: [
                '--disable-blink-features=AutomationControlled',
                '--no-first-run',
                '--no-default-browser-check',
            ],
        });
    } catch (e) {
        console.log('');
        console.log('ERROR: Could not launch Chrome.');
        console.log('Make sure Google Chrome is installed on your system.');
        console.log('');
        console.log('On macOS: brew install --cask google-chrome');
        console.log('On Ubuntu: sudo apt install google-chrome-stable');
        console.log('');
        throw e;
    }

    const page = await context.newPage();

    // Go to Colab
    await page.goto('https://colab.research.google.com/');
    await page.waitForTimeout(3000);

    // Check if we need to sign in by looking for:
    // 1. Sign-in button on page
    // 2. Being on Google sign-in page
    // 3. Lack of proper account avatar or user photo button

    const url = page.url();
    const hasSignInButton = await page.locator('a:has-text("Sign in"), button:has-text("Sign in")').first().isVisible({ timeout: 2000 }).catch(() => false);
    const onGoogleSignIn = url.includes('accounts.google.com');

    // More robust check for account avatar - look for actual account indicator
    // User photo button appears when logged in (circular avatar in top right)
    const hasAccountAvatar = await page.locator('[aria-label="Google Account"], [data-tooltip*="Google Account"], img[alt*="profile"], img[data-src*="googleusercontent.com"], img[src*="googleusercontent.com"]').first().isVisible({ timeout: 2000 }).catch(() => false);

    // Also check for "open notebook" dialog - this appears when user is logged in
    const hasOpenDialog = await page.locator('text=Recent, text=Open notebook').first().isVisible({ timeout: 1000 }).catch(() => false);

    // User is logged in if they have account avatar OR open dialog, AND no sign-in button
    const isLoggedIn = (hasAccountAvatar || hasOpenDialog) && !hasSignInButton && !onGoogleSignIn;
    const needsSignIn = !isLoggedIn;

    console.log(`Debug: hasSignInButton=${hasSignInButton}, onGoogleSignIn=${onGoogleSignIn}, hasAccountAvatar=${hasAccountAvatar}, hasOpenDialog=${hasOpenDialog}`);

    if (isLoggedIn) {
        console.log('Already signed in to Google!');
    } else {
        // Click sign-in button if present and we're on Colab
        if (hasSignInButton && !onGoogleSignIn) {
            console.log('Clicking Sign in button...');
            const signInButton = page.locator('a:has-text("Sign in"), button:has-text("Sign in")').first();
            await signInButton.click();
            await page.waitForTimeout(2000);
        }

        console.log('');
        console.log('╔════════════════════════════════════════════════════════════════╗');
        console.log('║  PLEASE SIGN IN TO GOOGLE IN THE BROWSER WINDOW               ║');
        console.log('║                                                                ║');
        console.log('║  Enter your email and password when prompted.                 ║');
        console.log('║  The script will continue automatically after sign-in.        ║');
        console.log('╚════════════════════════════════════════════════════════════════╝');
        console.log('');

        // Wait for sign-in to complete
        console.log('Waiting for sign-in to complete...');

        let signedIn = false;
        for (let i = 0; i < 300; i++) {  // 5 minutes max
            await page.waitForTimeout(1000);

            // Check if we're back on Colab and signed in
            const currentUrl = page.url();
            if (currentUrl.includes('colab.research.google.com') && !currentUrl.includes('accounts.google.com')) {
                // Look for signed-in indicators - use robust selectors
                // Include user photo button (googleusercontent.com images)
                const hasAccount = await page.locator('[aria-label="Google Account"], [data-tooltip*="Google Account"], img[alt*="profile"], img[data-src*="googleusercontent.com"], img[src*="googleusercontent.com"]').first().isVisible({ timeout: 500 }).catch(() => false);
                const hasNewNotebook = await page.locator('[aria-label="New notebook"], button:has-text("New notebook"), [data-tooltip="New notebook"]').first().isVisible({ timeout: 500 }).catch(() => false);
                // Check for "open notebook" dialog which appears when logged in
                const hasOpenDialog = await page.locator('text=Recent, text=Open notebook').first().isVisible({ timeout: 300 }).catch(() => false);

                // Also check that sign-in button is gone
                const stillHasSignIn = await page.locator('a:has-text("Sign in"), button:has-text("Sign in")').first().isVisible({ timeout: 300 }).catch(() => false);

                if ((hasAccount || hasNewNotebook || hasOpenDialog) && !stillHasSignIn) {
                    signedIn = true;
                    break;
                }
            }

            if (i % 15 === 0 && i > 0) {
                console.log(`  Still waiting for sign-in... (${i}s)`);
            }
        }

        if (!signedIn) {
            throw new Error('Sign-in timed out after 5 minutes');
        }
    }

    console.log('');
    console.log('✓ Sign-in detected!');
    console.log('');
    console.log('Saving authentication state...');

    // Save the storage state (cookies, localStorage, sessionStorage)
    await context.storageState({ path: AUTH_FILE });

    await context.close();

    console.log('');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('  SUCCESS!');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('');
    console.log(`  Auth state saved to: ${AUTH_FILE}`);
    console.log('');
    console.log('  Next step: Add secrets to Colab:');
    console.log('    1. Go to https://colab.research.google.com');
    console.log('    2. Click the key icon 🔑 in the left sidebar');
    console.log('    3. Add these secrets (enable "Notebook access" for each):');
    console.log('');
    console.log('       NDIF_API  - Your key from https://nnsight.net');
    console.log('       HF_TOKEN  - Your token from https://huggingface.co/settings/tokens');
    console.log('                   (Required for gated models like Llama)');
    console.log('');
    console.log('  Then run: ./scripts/test.sh colab');
    console.log('');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('');
});
