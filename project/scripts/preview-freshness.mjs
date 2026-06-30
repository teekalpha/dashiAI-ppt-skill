import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { npmCommand, npmCommandArgs, npmCommandOptions } from './command-paths.mjs';

export const ROOT = path.resolve(import.meta.dirname, '..');
export const DEFAULT_THEME_PREVIEW_ROOT = path.join(ROOT, 'output/theme-preview/ppt');

const DEFAULT_THEME_PREVIEW_INPUTS = [
  path.join(ROOT, 'assets/template-swiss.html'),
  path.join(ROOT, 'examples/component-decks/all-themes-showcase.jsx'),
  path.join(ROOT, 'src/renderDeck.jsx'),
  path.join(ROOT, 'src/components/themes'),
];

export function isDefaultThemePreviewRoot(serveRoot) {
  return path.resolve(serveRoot) === DEFAULT_THEME_PREVIEW_ROOT;
}

export function isThemePreviewFresh({ serveRoot = DEFAULT_THEME_PREVIEW_ROOT, inputPaths = DEFAULT_THEME_PREVIEW_INPUTS } = {}) {
  const indexFile = path.join(path.resolve(serveRoot), 'index.html');
  if (!existsSync(indexFile)) return false;
  return statSync(indexFile).mtimeMs >= latestMtimeMs(inputPaths);
}

export function ensureThemePreviewFresh({ serveRoot = DEFAULT_THEME_PREVIEW_ROOT, inputPaths = DEFAULT_THEME_PREVIEW_INPUTS, logger = console } = {}) {
  const resolvedServeRoot = path.resolve(serveRoot);
  if (!isDefaultThemePreviewRoot(resolvedServeRoot)) return false;
  if (isThemePreviewFresh({ serveRoot: resolvedServeRoot, inputPaths })) return false;

  mkdirSync(resolvedServeRoot, { recursive: true });
  logger.log?.(`[preview] Theme preview is stale; rendering ${path.relative(ROOT, resolvedServeRoot)}.`);
  execFileSync(npmCommand(), npmCommandArgs(['run', 'render:themes']), npmCommandOptions({
    cwd: ROOT,
    stdio: 'inherit',
  }));
  return true;
}

function latestMtimeMs(inputPaths) {
  return inputPaths.reduce((latest, inputPath) => Math.max(latest, pathMtimeMs(inputPath)), 0);
}

function pathMtimeMs(inputPath) {
  if (!existsSync(inputPath)) return 0;
  const stats = statSync(inputPath);
  if (!stats.isDirectory()) return stats.mtimeMs;

  let latest = stats.mtimeMs;
  for (const entry of readdirSync(inputPath, { withFileTypes: true })) {
    latest = Math.max(latest, pathMtimeMs(path.join(inputPath, entry.name)));
  }
  return latest;
}
