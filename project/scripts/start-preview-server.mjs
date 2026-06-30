#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { ensureThemePreviewFresh } from './preview-freshness.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const serveRoot = path.resolve(process.argv[2] || 'output/theme-preview/ppt');
const requestedPort = Number(process.env.DASHI_PPT_PREVIEW_PORT || process.argv[3] || 4178);
const host = process.env.DASHI_PPT_PREVIEW_HOST || process.env.HOST || '0.0.0.0';
const localName = process.env.DASHI_PPT_PREVIEW_NAME || os.hostname().split('.')[0] || 'localhost';
const portScanLimit = Math.max(40, Number(process.env.DASHI_PPT_PREVIEW_PORT_SCAN || 240));
const lockDir = process.env.DASHI_PPT_PREVIEW_LOCK_DIR || path.join(os.tmpdir(), 'dashiai-ppt-preview-ports');

if (!existsSync(path.join(serveRoot, 'index.html'))) {
  ensureThemePreviewFresh({ serveRoot });
}

if (!existsSync(path.join(serveRoot, 'index.html'))) {
  console.error(`Preview index.html not found: ${path.join(serveRoot, 'index.html')}`);
  process.exit(1);
}

ensureThemePreviewFresh({ serveRoot });

const reservation = await reserveAvailablePort(requestedPort, host);
const port = reservation.port;
const logFile = path.join(serveRoot, '.preview-server.log');
mkdirSync(serveRoot, { recursive: true });
const output = openSync(logFile, 'a');
const child = spawn(process.execPath, [
  path.join(ROOT, 'scripts/serve-preview-https.mjs'),
  serveRoot,
  String(port),
], {
  cwd: ROOT,
  detached: true,
  env: { ...process.env, HOST: host },
  stdio: ['ignore', output, output],
});
child.unref();
closeSync(output);

try {
  await waitForPreview(port);
} catch (error) {
  reservation.release();
  try {
    process.kill(child.pid, 'SIGTERM');
  } catch {}
  throw error;
}

const url = `https://${localName}.local:${port}/`;
const localUrl = `https://localhost:${port}/`;
const httpUrl = `http://127.0.0.1:${port}/`;
const localHttpUrl = `http://localhost:${port}/`;
const jadonHttpUrl = `http://${localName}.local:${port}/`;
writeFileSync(path.join(serveRoot, '.preview-server.json'), `${JSON.stringify({
  pid: child.pid,
  port,
  httpUrl,
  url,
  localHttpUrl,
  localUrl,
  jadonHttpUrl,
  serveRoot,
  logFile,
  startedAt: new Date().toISOString(),
}, null, 2)}\n`);
reservation.commit(child.pid);

console.log(`HTTP export URL: ${httpUrl}`);
console.log(`HTTPS preview URL: ${url}`);
console.log(`Local HTTP URL: ${localHttpUrl}`);
console.log(`Local HTTPS URL: ${localUrl}`);
console.log(`LAN HTTP URL (browse only, not export): ${jadonHttpUrl}`);
console.log(`PID: ${child.pid}`);

async function reserveAvailablePort(start, bindHost) {
  const base = Number.isFinite(start) && start > 0 ? Math.trunc(start) : 4178;
  for (let port = base; port < base + portScanLimit; port += 1) {
    const reservation = reservePortLock(port);
    if (!reservation) continue;
    if (await isPortAvailable(port, bindHost)) return reservation;
    reservation.release();
  }
  throw new Error(`No available preview port found from ${base} to ${base + portScanLimit - 1}`);
}

function reservePortLock(port) {
  mkdirSync(lockDir, { recursive: true });
  const lockFile = path.join(lockDir, `preview-${port}.lock`);
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const fd = openSync(lockFile, 'wx');
      writeFileSync(fd, `${JSON.stringify({
        port,
        pid: process.pid,
        state: 'starting',
        startedAt: new Date().toISOString(),
      })}\n`);
      closeSync(fd);
      return {
        port,
        commit(pid) {
          writeFileSync(lockFile, `${JSON.stringify({
            port,
            pid,
            parentPid: process.pid,
            serveRoot,
            startedAt: new Date().toISOString(),
          })}\n`);
        },
        release() {
          rmSync(lockFile, { force: true });
        },
      };
    } catch (error) {
      if (error?.code !== 'EEXIST') throw error;
      if (!isStalePortLock(lockFile)) return null;
      rmSync(lockFile, { force: true });
    }
  }
  return null;
}

function isStalePortLock(lockFile) {
  try {
    const data = JSON.parse(readFileSync(lockFile, 'utf8'));
    return !isPidAlive(data.pid);
  } catch {
    return true;
  }
}

function isPidAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function isPortAvailable(port, bindHost) {
  return new Promise(resolve => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => {
      server.close(() => resolve(true));
    });
    server.listen(port, bindHost);
  });
}

async function waitForPreview(port) {
  let lastError = null;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      await Promise.all([
        fetchHttp(`http://localhost:${port}/`),
        fetchHttps(`https://localhost:${port}/`),
      ]);
      return;
    } catch (error) {
      lastError = error;
      await sleep(250);
    }
  }
  throw new Error(`HTTPS preview did not become ready: ${lastError?.message || 'unknown error'}`);
}

function fetchHttps(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { rejectUnauthorized: false }, response => {
      response.resume();
      response.on('end', () => {
        if (response.statusCode === 200) resolve();
        else reject(new Error(`status=${response.statusCode}`));
      });
    }).on('error', reject);
  });
}

function fetchHttp(url) {
  return new Promise((resolve, reject) => {
    http.get(url, response => {
      response.resume();
      response.on('end', () => {
        if (response.statusCode === 200) resolve();
        else reject(new Error(`status=${response.statusCode}`));
      });
    }).on('error', reject);
  });
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
