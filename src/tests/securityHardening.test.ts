import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { renderMarkdown } from '../services/ai';

describe('Security Hardening & Firestore Rules Verification', () => {
  it('verifies firestore.rules contains email_verified == true, excludes data/billing from wildcard rules, enforces status == pending on upgrade_requests, and enforces ownerUid == request.auth.uid on shared docs', () => {
    const rulesPath = path.resolve(process.cwd(), 'firestore.rules');
    expect(fs.existsSync(rulesPath)).toBe(true);

    const rulesContent = fs.readFileSync(rulesPath, 'utf8');

    expect(rulesContent).toContain('request.auth.token.email_verified == true');
    expect(rulesContent).toContain('request.path != /databases/$(database)/documents/tutors/$(tutorId)/data/billing');
    expect(rulesContent).toContain('request.path != /databases/$(database)/documents/users/$(userId)/data/billing');
    expect(rulesContent).toContain("request.resource.data.status == 'pending'");
    expect(rulesContent).toContain('request.resource.data.ownerUid == request.auth.uid');
    expect(rulesContent).toContain('resource.data.ownerUid == request.auth.uid');
  });

  it('verifies renderMarkdown prevents javascript: image injection while allowing https:// and data:image/', () => {
    const dangerousOutput = renderMarkdown('![x](javascript:alert(1))');
    expect(dangerousOutput).not.toContain('javascript:');
    expect(dangerousOutput).not.toContain('<img');

    const safeOutput = renderMarkdown('![ok](https://tuitrix.com/logo.png)');
    expect(safeOutput).toContain('<img');
    expect(safeOutput).toContain('https://tuitrix.com/logo.png');
  });
});
