import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { initSentry } from '../services/sentry';

describe('PWA Service Worker & GitHub Release Configuration', () => {
  it('verifies public/sw.js contains tuitrix-v22, /icons/icon-192.png, /.well-known/, and Promise.allSettled', () => {
    const swPath = path.resolve(process.cwd(), 'public/sw.js');
    expect(fs.existsSync(swPath)).toBe(true);

    const swContent = fs.readFileSync(swPath, 'utf8');

    expect(swContent).toContain('tuitrix-v22');
    expect(swContent).toContain('/icons/icon-192.png');
    expect(swContent).toContain('/.well-known/');
    expect(swContent).toContain('Promise.allSettled');
  });

  it('verifies .github/workflows/deploy.yml contains VITE_SENTRY_DSN secret injection for builds', () => {
    const deployPath = path.resolve(process.cwd(), '.github/workflows/deploy.yml');
    expect(fs.existsSync(deployPath)).toBe(true);

    const deployContent = fs.readFileSync(deployPath, 'utf8');
    expect(deployContent).toContain('VITE_SENTRY_DSN: ${{ secrets.VITE_SENTRY_DSN }}');
  });

  it('verifies .github/workflows/android-apk.yml contains contents: write, VITE_FIREBASE_API_KEY, VITE_SENTRY_DSN, tuitrix-latest.apk, and softprops/action-gh-release@v2', () => {
    const workflowPath = path.resolve(process.cwd(), '.github/workflows/android-apk.yml');
    expect(fs.existsSync(workflowPath)).toBe(true);

    const workflowContent = fs.readFileSync(workflowPath, 'utf8');

    expect(workflowContent).toContain('contents: write');
    expect(workflowContent).toContain('VITE_FIREBASE_API_KEY');
    expect(workflowContent).toContain('VITE_SENTRY_DSN: ${{ secrets.VITE_SENTRY_DSN }}');
    expect(workflowContent).toContain('tuitrix-latest.apk');
    expect(workflowContent).toContain('softprops/action-gh-release@v2');
    expect(workflowContent).toContain('ANDROID_KEYSTORE_BASE64');
    expect(workflowContent).toContain('android.injected.signing.store.file');
    expect(workflowContent).toContain('assembleRelease bundleRelease');
    expect(workflowContent).toContain('rm -f "$RUNNER_TEMP/tuitrix-upload.jks"');
  });

  it('verifies initSentry safely returns false when VITE_SENTRY_DSN is unset', () => {
    const originalDsn = import.meta.env.VITE_SENTRY_DSN;
    try {
      (import.meta.env as Record<string, any>).VITE_SENTRY_DSN = '';
      expect(initSentry()).toBe(false);
    } finally {
      (import.meta.env as Record<string, any>).VITE_SENTRY_DSN = originalDsn;
    }
  });
});
