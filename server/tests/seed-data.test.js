import { describe, it, expect, beforeAll } from 'vitest';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Department, Zone, Contact, ExternalAuthority } from '../src/models/index.js';

/**
 * The seed data is content, and content rots. These tests run without a
 * database and fail the build if the IMC data ever stops meaning what the
 * architecture assumes it means.
 */
const SEEDS = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data', 'seeds');
const load = (f) => readFile(path.join(SEEDS, f), 'utf8').then(JSON.parse);

let departments, zones, contacts, authorities;

beforeAll(async () => {
  [departments, zones, contacts, authorities] = await Promise.all([
    load('departments.json'),
    load('zones.json'),
    load('contacts.json'),
    load('externalAuthorities.json'),
  ]);
});

describe('zones', () => {
  it('has exactly 22 zonal offices', () => {
    expect(zones).toHaveLength(22);
  });

  it('covers wards 1-85 with no gaps and no duplicates', () => {
    const owner = new Map();
    for (const z of zones) for (const w of z.wards) {
      expect(owner.has(w), `ward ${w} appears in two zones`).toBe(false);
      owner.set(w, z.zoneNumber);
    }
    const missing = [];
    for (let w = 1; w <= 85; w++) if (!owner.has(w)) missing.push(w);
    expect(missing).toEqual([]);
  });

  it('maps ward 47 to zone 9 — the multi-hop example in the docs', () => {
    const z = zones.find((x) => x.wards.includes(47));
    expect(z.zoneNumber).toBe(9);
    expect(z.officePhone).toBe('0731-4986513');
  });

  it('flags the two malformed phone numbers from the data quality register', () => {
    const unverified = zones.filter((z) => z.verified === false).map((z) => z.zoneNumber);
    expect(unverified.sort()).toEqual([10, 13]);
  });

  it('validates every zone against the schema', () => {
    for (const z of zones) expect(new Zone(z).validateSync(), `zone ${z.zoneNumber}`).toBeUndefined();
  });
});

describe('departments', () => {
  it('has 9 tier A departments — the launch scope', () => {
    expect(departments.filter((d) => d.coverageTier === 'A')).toHaveLength(9);
  });

  it('includes every tier A department named in the discovery doc', () => {
    const codes = departments.filter((d) => d.coverageTier === 'A').map((d) => d.code).sort();
    expect(codes).toEqual([
      'COMPLAINT_PROCEDURE', 'ELECTRICAL', 'FIRE', 'HOUSING',
      'PWD', 'REVENUE', 'SANITATION', 'SEWERAGE', 'WATER_WORKS',
    ]);
  });

  it('never marks a tier B department selectable', () => {
    // Tier B has a contact but no procedural content. Offering it in the
    // selector would invite the assistant to invent a procedure.
    const bad = departments.filter((d) => d.coverageTier === 'B' && d.isSelectable);
    expect(bad.map((d) => d.code)).toEqual([]);
  });

  it('gives every department both an English and a Hindi name', () => {
    for (const d of departments) {
      expect(d.name.en, d.code).toBeTruthy();
      expect(d.name.hi, d.code).toBeTruthy();
    }
  });

  it('has unique codes and slugs', () => {
    expect(new Set(departments.map((d) => d.code)).size).toBe(departments.length);
    expect(new Set(departments.map((d) => d.slug)).size).toBe(departments.length);
  });

  it('validates every department against the schema', () => {
    for (const d of departments) expect(new Department(d).validateSync(), d.code).toBeUndefined();
  });
});

describe('contacts', () => {
  it('only references departments that exist', () => {
    const codes = new Set(departments.map((d) => d.code));
    const dangling = contacts.filter((c) => c.departmentCode && !codes.has(c.departmentCode));
    expect(dangling.map((c) => c.departmentCode)).toEqual([]);
  });

  it('stores every mobile as exactly 10 digits, never a float', () => {
    // Data quality register #10: the source had "7974162847.0".
    for (const c of contacts) {
      if (c.mobile) expect(c.mobile, c.name).toMatch(/^[6-9]\d{9}$/);
    }
  });

  it('marks a contact unverified when the source has no mobile number', () => {
    for (const c of contacts) {
      if (!c.mobile) expect(c.verified, c.name).toBe(false);
    }
  });

  it('carries the PWD and Electrical contacts the discovery doc verified', () => {
    const find = (n) => contacts.find((c) => c.name.includes(n));
    expect(find('Srikant Kate').mobile).toBe('7974162847');
    expect(find('Ashwin Janvade').mobile).toBe('7440440005');
    expect(find('Vinod Mishra').mobile).toBe('7440440187');
  });

  it('validates every contact against the schema', () => {
    for (const { departmentCode: _c, ...rest } of contacts) {
      expect(new Contact(rest).validateSync(), rest.name).toBeUndefined();
    }
  });
});

describe('external authorities', () => {
  it('routes household power cuts to the Discom, not to IMC Electrical', () => {
    // The single most likely misroute — see docs/12-risks.md R6.
    const discom = authorities.find((a) => a.key === 'DISCOM_ELECTRICITY');
    expect(discom.phone).toBe('1912');
    expect(discom.handles.join(' ')).toMatch(/power cut/i);
  });

  it('routes ration cards away from IMC', () => {
    expect(authorities.find((a) => a.key === 'FOOD_CIVIL_SUPPLIES')).toBeTruthy();
  });

  it('has unique keys and validates against the schema', () => {
    expect(new Set(authorities.map((a) => a.key)).size).toBe(authorities.length);
    for (const a of authorities) expect(new ExternalAuthority(a).validateSync(), a.key).toBeUndefined();
  });
});
