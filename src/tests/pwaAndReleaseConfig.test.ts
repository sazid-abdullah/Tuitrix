import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

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

  it('verifies .github/workflows/android-apk.yml contains contents: write, VITE_FIREBASE_API_KEY, tuitrix-latest.apk, and softprops/action-gh-release@v2', () => {
    const workflowPath = path.resolve(process.cwd(), '.github/workflows/android-apk.yml');
    expect(fs.existsSync(workflowPath)).toBe(true);

    const workflowContent = fs.readFileSync(workflowPath, 'utf8');

    expect(workflowContent).toContain('contents: write');
    expect(workflowContent).toContain('VITE_FIREBASE_API_KEY');
    expect(workflowContent).toContain('tuitrix-latest.apk');
    expect(workflowContent).toContain('softprops/action-gh-release@v2');
  });
});
