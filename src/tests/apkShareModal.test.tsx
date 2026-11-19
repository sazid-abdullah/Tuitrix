/**
 * @vitest-environment jsdom
 */
import { expect, describe, it, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ApkShareModal } from '../components/ApkShareModal';
import fs from 'fs';
import path from 'path';

describe('ApkShareModal & PWA Manifests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders inline install guide notice when clicking Download Android APK without deferredPrompt and never calls window.alert', () => {
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});

    render(<ApkShareModal isOpen={true} onClose={vi.fn()} />);

    const downloadBtn = screen.getByRole('button', { name: /Download Android APK/i });
    expect(downloadBtn).toBeInTheDocument();

    // Initially notice is not visible
    expect(screen.queryByText(/To install Tuitrix: tap your browser menu/i)).not.toBeInTheDocument();

    // Click download
    fireEvent.click(downloadBtn);

    // Alert should not have been called
    expect(alertSpy).not.toHaveBeenCalled();

    // Inline notice should be displayed
    expect(
      screen.getByText(/To install Tuitrix: tap your browser menu \(⋮\) and choose 'Install App' or 'Add to Home Screen'/i)
    ).toBeInTheDocument();

    alertSpy.mockRestore();
  });

  it('copies window.location.origin via navigator.clipboard.writeText and displays Copied! when clicking Copy Link', async () => {
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: {
        writeText: writeTextMock,
      },
    });

    render(<ApkShareModal isOpen={true} onClose={vi.fn()} />);

    const copyBtn = screen.getByRole('button', { name: /Copy Link/i });
    expect(copyBtn).toBeInTheDocument();

    fireEvent.click(copyBtn);

    expect(writeTextMock).toHaveBeenCalledWith(window.location.origin);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Copied!/i })).toBeInTheDocument();
    });
  });

  it('validates public/manifest.json and twa-manifest.json parse cleanly and reference icon-192.png and icon-512.png', () => {
    const manifestPath = path.resolve(process.cwd(), 'public/manifest.json');
    const twaManifestPath = path.resolve(process.cwd(), 'twa-manifest.json');

    const manifestContent = fs.readFileSync(manifestPath, 'utf8');
    const twaManifestContent = fs.readFileSync(twaManifestPath, 'utf8');

    const manifest = JSON.parse(manifestContent);
    const twaManifest = JSON.parse(twaManifestContent);

    expect(manifest.name).toBe('Tuitrix · Tuition Manager');
    expect(manifest.icons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ src: './icons/icon-192.png', sizes: '192x192' }),
        expect.objectContaining({ src: './icons/icon-512.png', sizes: '512x512' }),
      ])
    );

    expect(twaManifest.packageId).toBe('com.tuitrix.app');
    expect(twaManifest.iconUrl).toContain('icon-512.png');
    expect(twaManifest.maskableIconUrl).toContain('icon-512.png');
  });
});
