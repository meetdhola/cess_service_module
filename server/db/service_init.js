/**
 * node server/db/service_init.js
 * Creates service module tables and seeds default users.
 */
require('dotenv').config();
const fs   = require('fs');
const path = require('path');
const pool = require('./pool');

// Generate random 6-digit key unique per user
function genKey() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

const SEED_USERS = [
  // superadmin
  { name: 'Divy Shah',          phone: '7435086581', role: 'superadmin', dept: 'Management' },
  { name: 'Chirag Shah',        phone: '9000000002', role: 'superadmin', dept: 'Management' },
  // admin
  { name: 'Jayesh Patel',       phone: '9000000003', role: 'admin',      dept: 'Operations' },
  { name: 'Ketan Tundiya',      phone: '9000000004', role: 'admin',      dept: 'Sales' },
  // plc workers
  { name: 'Hemant Patel',       phone: '9000000010', role: 'plc',        dept: 'Development' },
  { name: 'Chandresh Patel',    phone: '9000000011', role: 'plc',        dept: 'Development' },
  { name: 'Udit Prasad',        phone: '9000000012', role: 'plc',        dept: 'Operations' },
  { name: 'Hardik Panchal',     phone: '9000000013', role: 'plc',        dept: 'Development' },
  { name: 'Ritesh Valand',      phone: '9000000014', role: 'plc',        dept: 'Development' },
  // wireman workers
  { name: 'Ajay Chauhan',       phone: '9000000020', role: 'wireman',    dept: 'Operations' },
  { name: 'Alpesh Solanki',     phone: '9000000021', role: 'wireman',    dept: 'Operations' },
  { name: 'Batuk Thakor',       phone: '9000000022', role: 'wireman',    dept: 'Operations' },
  { name: 'Mangesh Chaudhary', phone: '9000000023', role: 'wireman',    dept: 'Operations' },
  { name: 'Jaydip Patel',       phone: '9000000024', role: 'wireman',    dept: 'Operations' },
];

async function init() {
  const client = await pool.connect();
  try {
    const schema = fs.readFileSync(
      path.join(__dirname, 'service_schema.sql'), 'utf8'
    );
    await client.query(schema);
    console.log('✅ Service schema created');

    console.log('\n📋 Seeding service users:');
    console.log('─'.repeat(60));
    console.log('Name                    Phone          Role        Key');
    console.log('─'.repeat(60));

    for (const u of SEED_USERS) {
      // Check if already exists
      const ex = await client.query(
        `SELECT id, secret_key FROM service_users WHERE phone=$1`, [u.phone]
      );
      let key;
      if (ex.rows.length) {
        key = ex.rows[0].secret_key;
        console.log(`${u.name.padEnd(24)} ${u.phone.padEnd(15)} ${u.role.padEnd(12)} ${key}  (existing)`);
      } else {
        key = genKey();
        // Ensure uniqueness
        let attempts = 0;
        while (attempts < 10) {
          const dup = await client.query(
            `SELECT id FROM service_users WHERE secret_key=$1`, [key]
          );
          if (!dup.rows.length) break;
          key = genKey();
          attempts++;
        }
        await client.query(
          `INSERT INTO service_users (name, phone, secret_key, role, department)
           VALUES ($1,$2,$3,$4,$5)`,
          [u.name, u.phone, key, u.role, u.dept]
        );
        console.log(`${u.name.padEnd(24)} ${u.phone.padEnd(15)} ${u.role.padEnd(12)} ${key}`);
      }
    }
    console.log('─'.repeat(60));
    console.log('\n✅ Service module seeded. Share the key with each user privately.\n');
  } catch (e) {
    console.error('❌ Error:', e.message);
    throw e;
  } finally {
    client.release();
    await pool.end();
  }
}

init().catch(() => process.exit(1));
