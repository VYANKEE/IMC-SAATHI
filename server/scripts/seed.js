/**
 * Seed the database from server/data/seeds/*.json.
 *
 *   npm run seed -- --dry-run    validate everything, touch no database
 *   npm run seed                 validate, then upsert into MongoDB
 *
 * The --dry-run mode is the point of this script's design. It validates every
 * seed record against the Mongoose schemas WITHOUT a connection, so a bad phone
 * number or a missing Hindi name is caught on your laptop in 200ms instead of
 * after it has been written to Atlas. Run it in CI too.
 *
 * Upserts are keyed on a natural unique field (code / zoneNumber / key), so
 * re-running the script updates rather than duplicating. Same idempotency rule
 * as the ingestion pipeline — see docs/01-requirements.md FR-A2.
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mongoose from 'mongoose';

import { connectDatabase, disconnectDatabase } from '../src/config/db.js';
import { Department, Zone, Contact, ExternalAuthority } from '../src/models/index.js';

const SEED_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data', 'seeds');
const dryRun = process.argv.includes('--dry-run');

const read = async (file) => JSON.parse(await readFile(path.join(SEED_DIR, file), 'utf8'));

/** Validate every record against its schema. Returns a list of problems. */
function validateAll(Model, rows, label, describe) {
  const problems = [];
  rows.forEach((row, i) => {
    const err = new Model(row).validateSync();
    if (err) {
      for (const [field, e] of Object.entries(err.errors)) {
        problems.push(`${label}[${i}] ${describe(row)} → ${field}: ${e.message}`);
      }
    }
  });
  return problems;
}

/** Cross-file checks that no single schema can express. */
function crossChecks(zones, departments, contacts, authorities) {
  const problems = [];

  // 1. The 22 zones must cover wards 1-85 exactly once. This is the property
  //    that makes "ward 47 -> zone -> phone number" trustworthy.
  const wardOwner = new Map();
  for (const z of zones) {
    for (const w of z.wards) {
      if (wardOwner.has(w)) problems.push(`ward ${w} is claimed by zone ${wardOwner.get(w)} and zone ${z.zoneNumber}`);
      wardOwner.set(w, z.zoneNumber);
    }
  }
  const missing = [];
  for (let w = 1; w <= 85; w++) if (!wardOwner.has(w)) missing.push(w);
  if (missing.length) problems.push(`wards not covered by any zone: ${missing.join(', ')}`);
  if (zones.length !== 22) problems.push(`expected 22 zones, found ${zones.length}`);

  // 2. Every contact must point at a department that actually exists.
  const codes = new Set(departments.map((d) => d.code));
  for (const c of contacts) {
    if (c.departmentCode && !codes.has(c.departmentCode)) {
      problems.push(`contact "${c.name}" references unknown department ${c.departmentCode}`);
    }
  }

  // 3. Duplicate natural keys would silently overwrite each other on upsert.
  const dup = (list, key, label) => {
    const seen = new Set();
    for (const item of list) {
      const v = item[key];
      if (seen.has(v)) problems.push(`duplicate ${label}: ${v}`);
      seen.add(v);
    }
  };
  dup(departments, 'code', 'department code');
  dup(zones, 'zoneNumber', 'zone number');
  dup(authorities, 'key', 'external authority key');

  return problems;
}

async function main() {
  const [departments, zones, contacts, authorities] = await Promise.all([
    read('departments.json'),
    read('zones.json'),
    read('contacts.json'),
    read('externalAuthorities.json'),
  ]);

  console.log(`\n  departments ${departments.length}   zones ${zones.length}   contacts ${contacts.length}   external authorities ${authorities.length}\n`);

  const problems = [
    ...validateAll(Department, departments, 'department', (d) => d.code),
    ...validateAll(Zone, zones, 'zone', (z) => `zone ${z.zoneNumber}`),
    ...validateAll(Contact, contacts.map(({ departmentCode: _c, ...rest }) => rest), 'contact', (c) => c.name),
    ...validateAll(ExternalAuthority, authorities, 'authority', (a) => a.key),
    ...crossChecks(zones, departments, contacts, authorities),
  ];

  if (problems.length) {
    console.error(`  ${problems.length} problem(s) found:\n`);
    problems.forEach((p) => console.error(`   ✗ ${p}`));
    console.error('');
    process.exit(1);
  }

  // Warnings are not failures — they are the data quality register showing up
  // at runtime. Unverified records are seeded but flagged, and the answer
  // pipeline must never inject an unverified number into a citizen's answer.
  const unverifiedZones = zones.filter((z) => z.verified === false);
  const noMobile = contacts.filter((c) => !c.mobile);
  console.log('  ✓ all records valid');
  console.log(`  ✓ 22 zones cover wards 1-85, no gaps, no duplicates`);
  if (unverifiedZones.length) {
    console.log(`\n  ${unverifiedZones.length} zone phone number(s) flagged unverified:`);
    unverifiedZones.forEach((z) => console.log(`    · zone ${z.zoneNumber} (${z.officePhone}) — ${z.verificationNote}`));
  }
  if (noMobile.length) {
    console.log(`\n  ${noMobile.length} contact row(s) have no mobile in the source document (seeded, flagged unverified)`);
  }

  if (dryRun) {
    console.log('\n  --dry-run: nothing written.\n');
    return;
  }

  const ok = await connectDatabase();
  if (!ok) {
    console.error('\n  MONGODB_URI is not set in server/.env — cannot seed.\n');
    process.exit(1);
  }

  const upsert = async (Model, rows, keyField) => {
    const ops = rows.map((row) => ({
      updateOne: { filter: { [keyField]: row[keyField] }, update: { $set: row }, upsert: true },
    }));
    const res = await Model.bulkWrite(ops, { ordered: false });
    return { inserted: res.upsertedCount, updated: res.modifiedCount };
  };

  const d = await upsert(Department, departments, 'code');
  const z = await upsert(Zone, zones, 'zoneNumber');
  const a = await upsert(ExternalAuthority, authorities, 'key');

  // Contacts have no natural key of their own, so they are resolved against the
  // department they belong to and keyed on (departmentId, name).
  const codeToId = new Map((await Department.find({}, 'code').lean()).map((x) => [x.code, x._id]));
  const contactOps = contacts.map(({ departmentCode, ...rest }) => ({
    updateOne: {
      filter: { name: rest.name, departmentId: codeToId.get(departmentCode) ?? null },
      update: { $set: { ...rest, departmentId: codeToId.get(departmentCode) ?? null } },
      upsert: true,
    },
  }));
  const cres = await Contact.bulkWrite(contactOps, { ordered: false });

  console.log(`\n  departments   +${d.inserted} new, ${d.updated} updated`);
  console.log(`  zones         +${z.inserted} new, ${z.updated} updated`);
  console.log(`  authorities   +${a.inserted} new, ${a.updated} updated`);
  console.log(`  contacts      +${cres.upsertedCount} new, ${cres.modifiedCount} updated`);
  console.log('\n  seed complete.\n');
}

main()
  .catch((err) => {
    console.error('\n  seed failed:', err.message, '\n');
    process.exitCode = 1;
  })
  .finally(async () => {
    if (mongoose.connection.readyState !== 0) await disconnectDatabase();
  });
