import { describe, it, expect, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { renderHook, act } from '@testing-library/react';
import React, { useState, useEffect } from 'react';
import { computeChecklistProgress } from '../views/HomeView';

// Read actual files from the disk
const indexHtmlContent = fs.readFileSync(path.resolve(__dirname, '../../index.html'), 'utf-8');
const firebaseJsonContent = fs.readFileSync(path.resolve(__dirname, '../../firebase.json'), 'utf-8');

describe('SEO & OpenGraph (Phase 8)', () => {
  it('index.html contains all required SEO and OpenGraph tags', () => {
    // Basic SEO
    expect(indexHtmlContent).toContain('<meta name="description"');
    expect(indexHtmlContent).toContain('<meta name="keywords"');
    expect(indexHtmlContent).toContain('<meta name="author" content="Sazid Abdullah"');

    // OpenGraph
    expect(indexHtmlContent).toContain('property="og:title"');
    expect(indexHtmlContent).toContain('property="og:description"');
    expect(indexHtmlContent).toContain('property="og:image" content="/og-banner.svg"');

    // Twitter
    expect(indexHtmlContent).toContain('name="twitter:card"');
    expect(indexHtmlContent).toContain('name="twitter:image" content="/og-banner.svg"');

    // JSON-LD
    expect(indexHtmlContent).toContain('type="application/ld+json"');
    expect(indexHtmlContent).toContain('"@type": "SoftwareApplication"');
    expect(indexHtmlContent).toContain('"applicationCategory": "EducationalApplication"');
  });
});

describe('Production Security Headers (Phase 8)', () => {
  it('firebase.json is valid and contains required security headers', () => {
    const firebaseJson = JSON.parse(firebaseJsonContent);

    expect(firebaseJson.hosting).toBeDefined();
    expect(firebaseJson.hosting.public).toBe('dist');
    expect(firebaseJson.hosting.rewrites).toContainEqual({
      source: '**',
      destination: '/index.html'
    });

    // Verify Security Headers
    const headersConfig = firebaseJson.hosting.headers.find((h: any) => h.source === '**');
    expect(headersConfig).toBeDefined();

    const headers = headersConfig.headers;
    expect(headers).toContainEqual({ key: 'X-Content-Type-Options', value: 'nosniff' });
    expect(headers).toContainEqual({ key: 'X-Frame-Options', value: 'SAMEORIGIN' });
    expect(headers).toContainEqual({ key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' });

    // Assetlinks Content-Type
    const assetlinksConfig = firebaseJson.hosting.headers.find((h: any) => h.source === '/.well-known/assetlinks.json');
    expect(assetlinksConfig.headers).toContainEqual({ key: 'Content-Type', value: 'application/json' });
  });
});

describe('In-App Support Flow (Phase 8 Checklist Logic)', () => {
  it('accurately calculates completed steps based on app state', () => {
    const emptyState = { students: [], lessons: [], savedResources: [], settings: {} };
    const r1 = computeChecklistProgress(emptyState);
    expect(r1.hasStudent).toBe(false);
    expect(r1.hasLesson).toBe(false);
    expect(r1.hasAI).toBe(false);
    expect(r1.hasSettings).toBe(false);

    const fullState = {
      students: [{ id: 's1' }],
      lessons: [{ id: 'l1' }],
      savedResources: [{ id: 'd1' }],
      settings: { tutorName: 'Sazid' }
    };
    const r2 = computeChecklistProgress(fullState);
    expect(r2.hasStudent).toBe(true);
    expect(r2.hasLesson).toBe(true);
    expect(r2.hasAI).toBe(true);
    expect(r2.hasSettings).toBe(true);
  });
});
