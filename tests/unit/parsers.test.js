import { parseCSVData, parseBulkData } from '../../lib/utils';
import fs from 'fs';
import path from 'path';

const datasetsDir = path.join(__dirname, '..', 'fixtures', 'datasets');

function loadDataset(name) {
  return fs.readFileSync(path.join(datasetsDir, name), 'utf-8');
}

describe('parseCSVData', () => {
  it('parses valid pipeline CSV from dataset', () => {
    const csv = loadDataset('pipeline_applications.csv');
    const result = parseCSVData(csv);
    // Header "applicationId,..." is not filtered (only "company,..." is)
    // so we get header + 3 data rows = 4 rows
    expect(result.length).toBe(4);
    // First row is the header parsed as data
    expect(result[0].company).toBe('applicationId');
  });

  it('parses standard CSV with header row', () => {
    const csv = 'Company,Role,Date Applied,Outcome,Notes\nAcme,Engineer,2025-06-01,No Response,Applied online';
    const result = parseCSVData(csv);
    expect(result.length).toBe(1);
    expect(result[0].company).toBe('Acme');
    expect(result[0].role).toBe('Engineer');
    expect(result[0].status).toBe('Applied');
  });

  it('skips header row starting with company', () => {
    const csv = 'Company,Role,Date,Outcome\nAcme,PM,2025-01-01,Rejected';
    const result = parseCSVData(csv);
    expect(result.length).toBe(1);
    expect(result[0].company).toBe('Acme');
  });

  it('maps all outcome types correctly', () => {
    const csv = [
      'Acme,PM,2025-01-01,Rejected,',
      'Beta,Eng,2025-01-02,No Response,',
      'Gamma,Des,2025-01-03,Screen,',
      'Delta,Ops,2025-01-04,Interview,',
      'Epsilon,Lead,2025-01-05,Offer,',
      'Zeta,IC,2025-01-06,Applied,',
    ].join('\n');
    const result = parseCSVData(csv);
    expect(result[0].status).toBe('Rejected');
    expect(result[1].status).toBe('Applied');
    expect(result[2].status).toBe('Recruiter Screen');
    expect(result[3].status).toBe('HM Interview');
    expect(result[4].status).toBe('Offer');
    expect(result[5].status).toBe('Applied');
  });

  it('handles missing outcome gracefully', () => {
    const csv = 'Acme,PM,2025-01-01,,';
    const result = parseCSVData(csv);
    expect(result.length).toBe(1);
    expect(result[0].status).toBe('Applied');
  });

  it('handles empty input', () => {
    const result = parseCSVData('');
    expect(result).toEqual([]);
  });

  it('handles whitespace-only input', () => {
    const result = parseCSVData('   \n  \n  ');
    expect(result).toEqual([]);
  });

  it('skips rows with missing company or role', () => {
    const csv = ',PM,2025-01-01,Applied,\nAcme,,2025-01-01,Applied,';
    const result = parseCSVData(csv);
    expect(result.length).toBe(0);
  });

  it('handles CSV with job postings dataset format', () => {
    const csv = loadDataset('job_postings.valid.csv');
    // Header "jobId,..." is not filtered (only "company,..." is)
    // so we get header + 4 data rows = 5 rows
    const result = parseCSVData(csv);
    expect(result.length).toBe(5);
    expect(result[0].company).toBe('jobId');
    // Data rows start at index 1
    expect(result[1].company).toBe('job_001');
  });
});

describe('parseBulkData', () => {
  it('parses pipe-separated format', () => {
    const bulk = 'Acme | Engineer | Applied | 2025-06-01\nBeta | Designer | Rejected | 2025-05-15';
    const result = parseBulkData(bulk);
    expect(result.length).toBe(2);
    expect(result[0].company).toBe('Acme');
    expect(result[0].role).toBe('Engineer');
    expect(result[0].status).toBe('Applied');
    expect(result[1].status).toBe('Rejected');
  });

  it('defaults to Applied for unknown status', () => {
    const bulk = 'Acme | PM | WhateverStatus | 2025-01-01';
    const result = parseBulkData(bulk);
    expect(result[0].status).toBe('Applied');
  });

  it('handles missing status and date', () => {
    const bulk = 'Acme | PM';
    const result = parseBulkData(bulk);
    expect(result.length).toBe(1);
    expect(result[0].status).toBe('Applied');
    expect(result[0].dateAdded).toBeTruthy();
  });

  it('handles empty input', () => {
    expect(parseBulkData('')).toEqual([]);
  });

  it('skips rows with missing company or role', () => {
    const bulk = ' | PM | Applied | 2025-01-01\nAcme |  | Applied | 2025-01-01';
    const result = parseBulkData(bulk);
    expect(result.length).toBe(0);
  });

  it('handles all valid STATUSES', () => {
    const bulk = [
      'A | R | Saved | 2025-01-01',
      'B | R | Ready to Apply | 2025-01-01',
      'C | R | Applied | 2025-01-01',
      'D | R | Recruiter Screen | 2025-01-01',
      'E | R | HM Interview | 2025-01-01',
      'F | R | Final Round | 2025-01-01',
      'G | R | Offer | 2025-01-01',
      'H | R | Rejected | 2025-01-01',
      'I | R | Skipped | 2025-01-01',
    ].join('\n');
    const result = parseBulkData(bulk);
    expect(result.length).toBe(9);
    expect(result.map(r => r.status)).toEqual([
      'Saved', 'Ready to Apply', 'Applied', 'Recruiter Screen',
      'HM Interview', 'Final Round', 'Offer', 'Rejected', 'Skipped'
    ]);
  });
});
