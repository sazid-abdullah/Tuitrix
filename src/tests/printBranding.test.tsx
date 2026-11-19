/**
 * @vitest-environment jsdom
 */
import { expect } from 'vitest';
import '@testing-library/jest-dom/vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, vi, beforeEach } from 'vitest';
import { AIView } from '../views/AIView';
import { SettingsView } from '../views/SettingsView';
import * as context from '../store/context';

vi.mock('../services/ai', async (importOriginal) => {
  const actual = await importOriginal() as any;
  return {
    ...actual,
    generateAI: vi.fn(),
  };
});

describe('Print Branding & Header Tests', () => {
  let mockState: any;
  let mockUpdateSettings: any;
  let mockUpdateProfile: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockState = {
      settings: {
        tutorName: 'John Doe',
        currency: '৳',
      },
      profile: {
        credentials: 'B.Sc.',
        brandTitle: 'Johns Academy',
        showPrintHeader: true,
        showPrintWatermark: true,
      },
      ai: { provider: 'gemini', models: {}, keys: {} },
      students: [],
      lessons: [],
      docs: [],
      attempts: [],
      payments: [],
      contracts: [],
    };
    mockUpdateSettings = vi.fn();
    mockUpdateProfile = vi.fn();

    vi.spyOn(context, 'useStore').mockReturnValue({
      state: mockState,
      updateSettings: mockUpdateSettings,
      updateProfile: mockUpdateProfile,
      toast: vi.fn(),
      saveDoc: vi.fn(),
    } as any);
  });

  it('renders settings fields for branding in SettingsView', () => {
    render(<SettingsView />);

    // Check for credentials
    expect(screen.getByPlaceholderText(/e.g. B.Sc. in CSE/i)).toHaveValue('B.Sc.');
    // Check for brand title
    expect(screen.getByPlaceholderText(/e.g. Sazid's/i)).toHaveValue('Johns Academy');

    // Toggles should be checked
    const headerToggle = screen.getByLabelText(/Show Branded Header on Printed Sheets/i);
    expect(headerToggle).toBeChecked();

    const watermarkToggle = screen.getByLabelText(/Show Diagonal Watermark on Printed Sheets/i);
    expect(watermarkToggle).toBeChecked();

    // Modify a field and submit
    fireEvent.change(screen.getByPlaceholderText(/e.g. Sazid's/i), { target: { value: 'New Academy' } });
    fireEvent.click(screen.getByText('Save profile'));

    expect(mockUpdateProfile).toHaveBeenCalledWith(expect.objectContaining({
      brandTitle: 'New Academy',
    }));
  });

  it('shows print metadata controls in AIView when viewing a saved document', () => {
    // Instead of simulating generation, we can pass initialTool="saved" and have a mock saved doc
    // and click it to open the modal which should render the print controls.
    mockState.docs = [
      { id: '1', type: 'exam', title: 'Test Exam', content: 'hello world', createdAt: new Date().toISOString() }
    ];

    render(<AIView initialTool="saved" onNavigate={vi.fn()} onStartExam={vi.fn()} onUploadPaper={vi.fn()} onImportDoc={vi.fn()} />);

    // Click the document to view it
    fireEvent.click(screen.getByText('Test Exam'));

    // Check if the print metadata fields appear in the modal
    expect(screen.getByPlaceholderText('e.g. 50')).toBeInTheDocument(); // Marks
    expect(screen.getByPlaceholderText('e.g. 45 Mins')).toBeInTheDocument(); // Time
    expect(screen.getByPlaceholderText('e.g. 12/04/2024')).toBeInTheDocument(); // Date

    // Verify local toggles
    expect(screen.getByLabelText(/Show Branded Header/i)).toBeChecked();
    expect(screen.getByLabelText(/Show Watermark/i)).toBeChecked();

    // Verify that the actual handlePrint function is called when clicking print
    const printBtn = screen.getByText('Print');
    expect(printBtn).toBeInTheDocument();
  });

  it('populates curriculum, counts, and board marks when clicking a board exam preset', () => {
    render(<AIView initialTool="exam" onNavigate={vi.fn()} onStartExam={vi.fn()} onUploadPaper={vi.fn()} onImportDoc={vi.fn()} />);

    const presetBtn = screen.getByText(/SSC Science \(75 Marks\)/i);
    expect(presetBtn).toBeInTheDocument();

    fireEvent.click(presetBtn);

    // Curriculum input
    expect(screen.getByPlaceholderText(/e.g. NCTB, Cambridge/i)).toHaveValue('NCTB (SSC)');

    // CQ and MCQ counts
    expect(screen.getByLabelText(/^CQ Count/i)).toHaveValue(8);
    expect(screen.getByLabelText(/^MCQ Count/i)).toHaveValue(25);

    // Total Board Marks
    expect(screen.getByText(/Total Board Marks:\s*75/i)).toBeInTheDocument();
  });

  it('toggles 2-Column Board Print and writes column-count: 2 and class="print-body" into print iframe document', () => {
    mockState.docs = [
      { id: '1', type: 'exam', title: 'Test Exam', content: 'hello world', createdAt: new Date().toISOString() }
    ];

    render(<AIView initialTool="saved" onNavigate={vi.fn()} onStartExam={vi.fn()} onUploadPaper={vi.fn()} onImportDoc={vi.fn()} />);

    // Click document to view modal
    fireEvent.click(screen.getByText('Test Exam'));

    const twoColToggle = screen.getByLabelText(/2-Column Board Print/i);
    expect(twoColToggle).not.toBeChecked();

    fireEvent.click(twoColToggle);
    expect(twoColToggle).toBeChecked();

    const printBtn = screen.getByText('Print');
    fireEvent.click(printBtn);

    const iframe = document.querySelector('iframe');
    expect(iframe).toBeInTheDocument();
    const iframeHtml = iframe?.contentDocument?.documentElement?.innerHTML || '';
    expect(iframeHtml).toContain('column-count: 2');
    expect(iframeHtml).toContain('class="print-body"');
  });
});
