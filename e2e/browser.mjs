// Chromium for the e2e and image scripts: CHROMIUM_PATH if set, a preinstalled copy if one exists,
// otherwise the browser Playwright installed (`npx playwright install chromium`, as CI does).
import { existsSync } from 'node:fs';
import { chromium } from 'playwright';

const PREINSTALLED = '/opt/pw-browsers/chromium';

export function launchChromium() {
  const executablePath = process.env.CHROMIUM_PATH || (existsSync(PREINSTALLED) ? PREINSTALLED : undefined);
  return chromium.launch({ executablePath });
}
