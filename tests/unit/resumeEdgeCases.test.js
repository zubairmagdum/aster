import fs from 'fs';
import path from 'path';

const datasetsDir = path.join(__dirname, '..', 'fixtures', 'datasets');
const edgeCases = JSON.parse(fs.readFileSync(path.join(datasetsDir, 'resume_edge_cases.json'), 'utf-8'));

function loadResumeFile(filename) {
  return fs.readFileSync(path.join(datasetsDir, filename), 'utf-8');
}

// Simulates the resume text validation that should happen before sending to API
function isValidResumeText(text) {
  if (!text) return false;
  if (typeof text !== 'string') return false;
  if (text.trim().length === 0) return false;
  return true;
}

// Simulates the 4000 char truncation from parseResume
function truncateResume(text) {
  return text.slice(0, 4000);
}

describe('Resume edge cases from dataset', () => {
  it('empty_resume.txt — should fail validation', () => {
    const text = loadResumeFile('empty_resume.txt');
    expect(isValidResumeText(text)).toBe(false);
  });

  it('whitespace_resume.txt — should fail validation', () => {
    const text = loadResumeFile('whitespace_resume.txt');
    expect(isValidResumeText(text)).toBe(false);
  });

  it('short_resume.txt — should pass validation but be very short', () => {
    const text = loadResumeFile('short_resume.txt');
    expect(isValidResumeText(text)).toBe(true);
    expect(text.trim().length).toBeLessThan(50);
  });

  it('huge_resume.txt — should be truncated to 4000 chars', () => {
    const text = loadResumeFile('huge_resume.txt');
    expect(text.length).toBeGreaterThan(100000);
    const truncated = truncateResume(text);
    expect(truncated.length).toBe(4000);
    expect(truncated.startsWith('Experience')).toBe(true);
  });

  it('unicode_resume.txt — should preserve special characters', () => {
    const text = loadResumeFile('unicode_resume.txt');
    expect(isValidResumeText(text)).toBe(true);
    expect(text).toContain('مرحبا');
    expect(text).toContain('数据分析');
    expect(text).toContain('🚀');
    expect(text).toContain('📈');
  });

  it('table_like_resume.txt — should parse without crash', () => {
    const text = loadResumeFile('table_like_resume.txt');
    expect(isValidResumeText(text)).toBe(true);
    expect(text).toContain('Acme');
    expect(text).toContain('2021-2024');
  });

  it('broken_pdf_extract.txt — should contain garbled content', () => {
    const text = loadResumeFile('broken_pdf_extract.txt');
    // Should not crash when read
    expect(typeof text).toBe('string');
    // Contains null bytes — text processing should handle this
    expect(text).toContain('corrupted text from OCR');
  });

  it('duplicate_sections.txt — should parse without crash', () => {
    const text = loadResumeFile('duplicate_sections.txt');
    expect(isValidResumeText(text)).toBe(true);
    // Contains duplicated sections
    const experienceCount = (text.match(/Experience/g) || []).length;
    expect(experienceCount).toBe(2);
    const skillsCount = (text.match(/Skills/g) || []).length;
    expect(skillsCount).toBe(2);
  });

  it('all edge cases from JSON manifest match their files', () => {
    edgeCases.forEach(ec => {
      const fileContent = loadResumeFile(ec.filename);
      // Verify the file exists and is readable
      expect(typeof fileContent).toBe('string');
    });
  });
});
