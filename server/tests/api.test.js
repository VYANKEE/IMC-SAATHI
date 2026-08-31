import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

/**
 * Route-level tests with the repository layer mocked.
 *
 * This exercises the whole request path — validate middleware, controller,
 * service, error handler — without a database, so it runs in milliseconds and
 * can run in CI. What it deliberately does NOT test is whether the Mongo
 * queries themselves are correct; that needs a real database and is verified
 * by `npm run seed` plus a manual check against Atlas.
 */
vi.mock('../src/repositories/department.repository.js', () => ({
  findSelectableDepartments: vi.fn(),
  findAllDepartments: vi.fn(),
  findDepartmentBySlug: vi.fn(),
  findContactsForDepartment: vi.fn(),
}));
vi.mock('../src/repositories/zone.repository.js', () => ({
  findAllZones: vi.fn(),
  findZoneByNumber: vi.fn(),
  findZoneByWard: vi.fn(),
}));
vi.mock('../src/repositories/knowledgeChunk.repository.js', () => ({
  findPrimaryChunksForDepartment: vi.fn(),
  countActiveChunksByDepartment: vi.fn(),
}));

const deptRepo = await import('../src/repositories/department.repository.js');
const zoneRepo = await import('../src/repositories/zone.repository.js');
const chunkRepo = await import('../src/repositories/knowledgeChunk.repository.js');
const { createApp } = await import('../src/app.js');
const app = createApp();

const ELECTRICAL = {
  _id: 'd1',
  code: 'ELECTRICAL',
  slug: 'electrical-mechanical',
  name: { en: 'Electrical & Mechanical', hi: 'विद्युत एवं यांत्रिकी विभाग' },
  description: {
    en: 'Street lights and municipal electrical work.',
    hi: 'स्ट्रीट लाइट एवं नगरीय विद्युत कार्य।',
  },
  responsibilities: { en: ['Street light maintenance'], hi: ['स्ट्रीट लाइट रखरखाव'] },
  coverageTier: 'A',
  isSelectable: true,
  officeTiming: { days: 'Monday to Friday', from: '10:00', to: '18:00' },
  sourceDocuments: ['Electrical_and_mechanical_dept_final.docx'],
};

const ZONE_9 = {
  zoneNumber: 9,
  name: { en: 'Dr. Bhimrao Ambedkar Zone', hi: 'डॉ. भीमराव अंबेडकर ज़ोन' },
  wards: [26, 44, 45, 46, 47],
  officePhone: '0731-4986513',
  zonalOfficer: { name: 'Mr. Abhishek Singh', mobile: null },
  asstRevenueOfficer: { name: 'Prashant Patel', mobile: '8770360504' },
  csiHealth: { mobile: '7440443429' },
  verified: true,
};

beforeEach(() => vi.clearAllMocks());

describe('GET /api/departments', () => {
  it('returns selectable departments in the requested language', async () => {
    deptRepo.findSelectableDepartments.mockResolvedValue([ELECTRICAL]);

    const en = await request(app).get('/api/departments');
    expect(en.status).toBe(200);
    expect(en.body.data.departments[0].name).toBe('Electrical & Mechanical');

    const hi = await request(app).get('/api/departments?lang=hi');
    expect(hi.body.data.departments[0].name).toBe('विद्युत एवं यांत्रिकी विभाग');
  });

  it('rejects an unsupported language instead of silently defaulting', async () => {
    const res = await request(app).get('/api/departments?lang=fr');
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('uses the all-departments query only when asked', async () => {
    deptRepo.findSelectableDepartments.mockResolvedValue([]);
    deptRepo.findAllDepartments.mockResolvedValue([]);

    await request(app).get('/api/departments');
    expect(deptRepo.findAllDepartments).not.toHaveBeenCalled();

    await request(app).get('/api/departments?all=true');
    expect(deptRepo.findAllDepartments).toHaveBeenCalled();
  });
});

describe('GET /api/departments/:slug', () => {
  it('returns the department with its verified contacts', async () => {
    deptRepo.findDepartmentBySlug.mockResolvedValue(ELECTRICAL);
    deptRepo.findContactsForDepartment.mockResolvedValue([
      {
        name: 'Mr. Ashwin Janvade',
        designation: 'In-Charge Executive Engineer',
        mobile: '7440440005',
        isPrimary: true,
      },
    ]);

    const res = await request(app).get('/api/departments/electrical-mechanical');
    expect(res.status).toBe(200);
    expect(res.body.data.contacts[0].mobile).toBe('7440440005');
    expect(res.body.data.officeTiming.days).toBe('Monday to Friday');
  });

  it('404s with a code for an unknown department', async () => {
    deptRepo.findDepartmentBySlug.mockResolvedValue(null);
    const res = await request(app).get('/api/departments/does-not-exist');
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('DEPARTMENT_NOT_FOUND');
  });

  it('rejects a slug that could be a path-traversal attempt', async () => {
    const res = await request(app).get('/api/departments/..%2F..%2Fetc');
    expect(res.status).toBe(400);
  });
});

describe('GET /api/zones/by-ward/:wardNumber', () => {
  it('resolves ward 47 to zone 9 and its office phone', async () => {
    zoneRepo.findZoneByWard.mockResolvedValue(ZONE_9);
    const res = await request(app).get('/api/zones/by-ward/47');

    expect(res.status).toBe(200);
    expect(res.body.data.zoneNumber).toBe(9);
    expect(res.body.data.officePhone).toBe('0731-4986513');
    // The ward number must reach the repository as a NUMBER, not the string
    // "47" — a string would silently match nothing against a numeric array.
    expect(zoneRepo.findZoneByWard).toHaveBeenCalledWith(47);
  });

  it('NEVER returns a phone number that failed seed validation', async () => {
    // Zone 10's landline has a Raipur STD code in the source document.
    // docs/data-quality-register.md #14.
    zoneRepo.findZoneByWard.mockResolvedValue({
      ...ZONE_9,
      zoneNumber: 10,
      officePhone: '0771-2497422',
      verified: false,
    });

    const res = await request(app).get('/api/zones/by-ward/42');
    expect(res.body.data.officePhone).toBeNull();
    expect(res.body.data.phoneUnverified).toBe(true);
    expect(JSON.stringify(res.body)).not.toContain('0771');
  });

  it('rejects a ward outside 1-85 before touching the database', async () => {
    const res = await request(app).get('/api/zones/by-ward/999');
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/85 wards/);
    expect(zoneRepo.findZoneByWard).not.toHaveBeenCalled();
  });

  it('rejects a non-numeric ward', async () => {
    const res = await request(app).get('/api/zones/by-ward/abc');
    expect(res.status).toBe(400);
    expect(zoneRepo.findZoneByWard).not.toHaveBeenCalled();
  });

  it('404s for a ward with no zone', async () => {
    zoneRepo.findZoneByWard.mockResolvedValue(null);
    const res = await request(app).get('/api/zones/by-ward/50');
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('WARD_NOT_FOUND');
  });
});

describe('GET /api/departments/:slug/suggested-questions', () => {
  it('returns real, corpus-derived questions for the department', async () => {
    deptRepo.findDepartmentBySlug.mockResolvedValue(ELECTRICAL);
    chunkRepo.findPrimaryChunksForDepartment.mockResolvedValue([
      { text: 'Q: Street light is not working, what do I do?\nA: File via the app.' },
      { text: 'Q: How do I report a fallen electric pole?\nA: Call the emergency line.' },
    ]);

    const res = await request(app).get(
      '/api/departments/electrical-mechanical/suggested-questions'
    );
    expect(res.status).toBe(200);
    expect(res.body.data.departmentId).toBe('ELECTRICAL');
    expect(res.body.data.questions).toEqual([
      'Street light is not working, what do I do?',
      'How do I report a fallen electric pole?',
    ]);
  });

  it('404s with a code for an unknown department', async () => {
    deptRepo.findDepartmentBySlug.mockResolvedValue(null);
    const res = await request(app).get('/api/departments/does-not-exist/suggested-questions');
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('DEPARTMENT_NOT_FOUND');
    expect(chunkRepo.findPrimaryChunksForDepartment).not.toHaveBeenCalled();
  });
});

describe('error handling', () => {
  it('never leaks an internal error to the citizen', async () => {
    deptRepo.findSelectableDepartments.mockRejectedValue(
      new Error('MongoServerError: connection refused to cluster0.abcde.mongodb.net')
    );
    const res = await request(app).get('/api/departments');

    expect(res.status).toBe(500);
    expect(res.body.code).toBe('INTERNAL_ERROR');
    expect(res.body.message).toBe('Unable to process your request');
    expect(JSON.stringify(res.body)).not.toContain('mongodb.net');
  });
});
