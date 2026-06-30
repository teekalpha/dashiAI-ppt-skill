#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';

function resolveExistingPath(candidate) {
  if (!candidate) return '';
  const resolved = path.resolve(candidate);
  return existsSync(resolved) ? resolved : '';
}

function lookupCommand(command) {
  const binary = process.platform === 'win32' ? 'where' : 'which';
  try {
    const output = execFileSync(binary, [command], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return output
      .split(/\r?\n/)
      .map(line => line.trim())
      .find(line => line && existsSync(line)) || '';
  } catch {
    return '';
  }
}

function platformCandidates() {
  if (process.platform === 'win32') {
    return [
      process.env.CHROME_PATH,
      process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Google', 'Chrome', 'Application', 'chrome.exe'),
      process.env.PROGRAMFILES && path.join(process.env.PROGRAMFILES, 'Google', 'Chrome', 'Application', 'chrome.exe'),
      process.env['PROGRAMFILES(X86)'] && path.join(process.env['PROGRAMFILES(X86)'], 'Google', 'Chrome', 'Application', 'chrome.exe'),
      process.env.PROGRAMFILES && path.join(process.env.PROGRAMFILES, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
      process.env['PROGRAMFILES(X86)'] && path.join(process.env['PROGRAMFILES(X86)'], 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    ].filter(Boolean);
  }

  if (process.platform === 'darwin') {
    return [
      process.env.CHROME_PATH,
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Chromium.app/Contents/MacOS/Chromium',
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    ].filter(Boolean);
  }

  return [
    process.env.CHROME_PATH,
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/microsoft-edge',
  ].filter(Boolean);
}

export function resolveChromeExecutablePath() {
  for (const candidate of platformCandidates()) {
    const resolved = resolveExistingPath(candidate);
    if (resolved) return resolved;
  }

  const commands = process.platform === 'win32'
    ? ['chrome.exe', 'msedge.exe']
    : ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser', 'microsoft-edge'];

  for (const command of commands) {
    const resolved = lookupCommand(command);
    if (resolved) return resolved;
  }

  return '';
}

export function getChromeExecutablePath() {
  const resolved = resolveChromeExecutablePath();
  if (resolved) return resolved;
  throw new Error(
    'Chrome executable not found. Set CHROME_PATH to a local Chrome/Chromium executable and rerun the validation.',
  );
}
