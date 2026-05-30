const { Pool } = require('pg');

const pool = new Pool({
  host:     process.env.DB_HOST     || 'localhost',
  port:     parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME     || 'cess_tracker',
  user:     process.env.DB_USER     || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
});

function genKey() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

// Role mapping: schema only allows plc, wireman, admin, superadmin
// heads → admin (they manage teams)
// accounts → admin
// sales → admin
function mapRole(role) {
  const map = { heads: 'admin', accounts: 'admin', sales: 'admin' };
  return map[role] || role;
}

// Seniority mapping: schema CHECK allows only: senior, junior, specialist
function mapSeniority(s) {
  if (!s) return 'junior';
  const lower = s.toLowerCase();
  if (lower.includes('specialist')) return 'specialist';
  if (lower.includes('senior'))     return 'senior';
  if (lower.includes('junior'))     return 'junior';
  if (lower.includes('head'))       return 'senior';
  if (lower.includes('super'))      return 'senior';
  if (lower.includes('admin'))      return 'senior';
  if (lower.includes('account'))    return 'senior';
  if (lower.includes('sales'))      return 'junior';
  return 'junior';
}

// IRC: the seed has annual IRC, but column is irc_daily_rate
// Approximate daily rate = annual / 365
function dailyRate(annual) {
  if (!annual) return 0;
  return Math.round((annual / 365) * 100) / 100;
}

const SEED_USERS = [
  // SUPERADMINS
  { name: 'Divy Shah',           phone: '7435086581', role: 'superadmin', department: 'Management', salary: null,   irc: null,   seniority: 'Superadmin' },
  // ADMINS
  { name: 'Chirag Shah',         phone: '9825061408', role: 'admin',      department: 'Management', salary: null,   irc: null,   seniority: 'Admin' },
  { name: 'Harish Joshi',        phone: '9825026329', role: 'admin',      department: 'Management', salary: null,   irc: null,   seniority: 'Admin' },
  { name: 'Viral Trivedi',       phone: '9998853260', role: 'admin',      department: 'Management', salary: null,   irc: null,   seniority: 'Admin' },
  { name: 'Sejal Prajapati',     phone: '7041318761', role: 'admin',      department: 'Management', salary: null,   irc: null,   seniority: 'Admin' },
  { name: 'Shivani Shakyawar',   phone: '8401357388', role: 'admin',      department: 'Management', salary: null,   irc: null,   seniority: 'Admin' },
  // ACCOUNTS → admin
  { name: 'Nikita Koshti',       phone: '9998865960', role: 'accounts',   department: 'Accounts',   salary: null,   irc: null,   seniority: 'Account' },
  { name: 'Yogita Shah',         phone: '9998831360', role: 'accounts',   department: 'Accounts',   salary: null,   irc: null,   seniority: 'Account' },
  { name: 'Pooja Sojitra',       phone: '6353074717', role: 'accounts',   department: 'Accounts',   salary: null,   irc: null,   seniority: 'Account' },
  // SALES → admin
  { name: 'Ketan Tundiya',       phone: '9879745094', role: 'sales',      department: 'Sales',      salary: null,   irc: null,   seniority: 'Sales' },
  { name: 'Pradam Bhadoriya',    phone: '9998847160', role: 'sales',      department: 'Sales',      salary: null,   irc: null,   seniority: 'Sales' },
  { name: 'Chetankumar Shah',    phone: '7574835157', role: 'sales',      department: 'Sales',      salary: null,   irc: null,   seniority: 'Sales' },
  { name: 'Vivardhan Gandhi',    phone: '9320801433', role: 'sales',      department: 'Sales',      salary: null,   irc: null,   seniority: 'Sales' },
  // HEADS → admin
  { name: 'Kaushal Patel',       phone: '9909973972', role: 'heads',      department: 'Design',     salary: null,   irc: null,   seniority: 'Head-WI' },
  { name: 'Jayesh Patel',        phone: '7742889307', role: 'heads',      department: 'Wireman',    salary: null,   irc: null,   seniority: 'Head-WI' },
  { name: 'Bhavesh Prajapati',   phone: '9879745092', role: 'heads',      department: 'PLC',        salary: 182500, irc: 219000, seniority: 'Head-PLC' },
  { name: 'Chirag Patel',        phone: '7435086580', role: 'heads',      department: 'PLC',        salary: 77000,  irc: 93000,  seniority: 'Head-PLC' },
  { name: 'Hardik Panchal',      phone: '8155030044', role: 'heads',      department: 'PLC',        salary: 94500,  irc: 93000,  seniority: 'Head-PLC' },
  // SENIOR PLC
  { name: 'Durgesh Sharma',      phone: '7041318507', role: 'plc',        department: 'PLC',        salary: 74000,  irc: 93000,  seniority: 'Senior PLC' },
  { name: 'Chandresh Patel',     phone: '9879745096', role: 'plc',        department: 'PLC',        salary: 76000,  irc: 93000,  seniority: 'Senior PLC' },
  { name: 'Devang Patel',        phone: '9998824760', role: 'plc',        department: 'PLC',        salary: 76000,  irc: 93000,  seniority: 'Senior PLC' },
  { name: 'Hemant Patel',        phone: '9879745097', role: 'plc',        department: 'PLC',        salary: 80500,  irc: 93000,  seniority: 'Senior PLC' },
  { name: 'Mitesh Panchal',      phone: '9426231849', role: 'plc',        department: 'PLC',        salary: 57000,  irc: 93000,  seniority: 'Senior PLC' },
  { name: 'Ritesh Valand',       phone: '9099087102', role: 'plc',        department: 'PLC',        salary: 65000,  irc: 93000,  seniority: 'Senior PLC' },
  { name: 'Kushal Mehta',        phone: '8155030022', role: 'plc',        department: 'PLC',        salary: 81000,  irc: 93000,  seniority: 'Senior PLC' },
  { name: 'Tirth Joshi',         phone: '7435086573', role: 'plc',        department: 'PLC',        salary: 61000,  irc: 93000,  seniority: 'Senior PLC' },
  { name: 'Sunil Prajapati',     phone: '9099088812', role: 'plc',        department: 'PLC',        salary: 78600,  irc: 93000,  seniority: 'Senior PLC' },
  { name: 'Sunilkumar Patel',    phone: '8155030033', role: 'plc',        department: 'PLC',        salary: 96000,  irc: 93000,  seniority: 'Senior PLC' },
  // JUNIOR PLC
  { name: 'Sahil Prajapati',     phone: '8866832562', role: 'plc',        department: 'PLC',        salary: 26500,  irc: 30000,  seniority: 'Junior PLC' },
  { name: 'Vaibhav Gajjar',      phone: '7435086576', role: 'plc',        department: 'PLC',        salary: 26600,  irc: 30000,  seniority: 'Junior PLC' },
  { name: 'Neel Suthar',         phone: '9998821460', role: 'plc',        department: 'PLC',        salary: 32000,  irc: 35000,  seniority: 'Junior PLC' },
  { name: 'Manju Prajapati',     phone: '9099087105', role: 'plc',        department: 'PLC',        salary: 19000,  irc: 30000,  seniority: 'Junior PLC' },
  { name: 'Dipak Panchal',       phone: '7041318582', role: 'plc',        department: 'PLC',        salary: 16500,  irc: 30000,  seniority: 'Junior PLC' },
  // WIREMEN
  { name: 'Alpesh Solanki',      phone: '9601597024', role: 'wireman',    department: 'Wireman',    salary: 45000,  irc: 55000,  seniority: 'Wireman' },
  { name: 'Batuk Thakor',        phone: '6354654192', role: 'wireman',    department: 'Wireman',    salary: 40500,  irc: 49000,  seniority: 'Wireman' },
  { name: 'Kalabhai Dabhi',      phone: '9099933607', role: 'wireman',    department: 'Wireman',    salary: 33500,  irc: 40000,  seniority: 'Head-WI' },
  { name: 'Sanjay Dabhi',        phone: '9824856294', role: 'wireman',    department: 'Wireman',    salary: 32000,  irc: 40000,  seniority: 'Wireman' },
  { name: 'Himmat Parmar',       phone: '8460686338', role: 'wireman',    department: 'Wireman',    salary: 24200,  irc: 40000,  seniority: 'Wireman' },
  { name: 'Govind Makwana',      phone: '9924070294', role: 'wireman',    department: 'Wireman',    salary: 33500,  irc: 40000,  seniority: 'Wireman' },
  { name: 'Mangesh Chaudhary',   phone: '8758011461', role: 'wireman',    department: 'Wireman',    salary: 32500,  irc: 40000,  seniority: 'Wireman' },
  { name: 'Jaynti Parmar',       phone: '7984208349', role: 'wireman',    department: 'Wireman',    salary: 21000,  irc: 40000,  seniority: 'Wireman' },
  { name: 'Rahul Parmar',        phone: '8849525403', role: 'wireman',    department: 'Wireman',    salary: 30500,  irc: 40000,  seniority: 'Wireman' },
  { name: 'Jaydip Patel',        phone: '9998851560', role: 'wireman',    department: 'Wireman',    salary: 52500,  irc: 63000,  seniority: 'Wireman' },
  { name: 'Sujal Parmar',        phone: '6353443544', role: 'wireman',    department: 'Wireman',    salary: 22500,  irc: 40000,  seniority: 'Wireman' },
  { name: 'Siddharaj Prajapati', phone: '9924593825', role: 'wireman',    department: 'Wireman',    salary: 17500,  irc: 40000,  seniority: 'Wireman' },
  { name: 'Dheeraj Singh',       phone: '9793559674', role: 'wireman',    department: 'Wireman',    salary: 23500,  irc: 40000,  seniority: 'Wireman' },
  // SPECIALIST PLC
  { name: 'Ravindra Panchal',    phone: '9909972596', role: 'plc',        department: 'PLC',        salary: 165000, irc: 198000, seniority: 'Specialist-PLC' },
];

async function seed() {
  console.log('Starting seed...\n');
  const results = [];

  for (const u of SEED_USERS) {
    const phone    = u.phone.replace(/\s/g, '').trim();
    const role     = mapRole(u.role);
    const seniority = mapSeniority(u.seniority);
    const monthly  = u.salary || 0;
    const irc_daily = dailyRate(u.irc);
    const key      = genKey();

    try {
      const { rowCount } = await pool.query(
        `INSERT INTO service_users
           (name, phone, role, department, monthly_salary, irc_daily_rate, seniority, secret_key, is_active)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,TRUE)
         ON CONFLICT (phone) DO UPDATE SET
           name           = EXCLUDED.name,
           role           = EXCLUDED.role,
           department     = EXCLUDED.department,
           monthly_salary = EXCLUDED.monthly_salary,
           irc_daily_rate = EXCLUDED.irc_daily_rate,
           seniority      = EXCLUDED.seniority`,
        [u.name, phone, role, u.department, monthly, irc_daily, seniority, key]
      );
      const action = rowCount ? 'INSERTED' : 'UPDATED';
      console.log(`✅ [${action}] ${u.name.padEnd(22)} | ${phone.padEnd(12)} | ${role.padEnd(12)} | key: ${key}`);
      results.push({ name: u.name, phone, role, key, status: action });
    } catch (e) {
      console.log(`❌ [FAILED ] ${u.name.padEnd(22)} | ${phone} | ${e.message}`);
    }
  }

  console.log('\n═══════════════════════════════════════════════════');
  console.log('SEEDING COMPLETE — Save these login credentials:');
  console.log('═══════════════════════════════════════════════════');
  console.log('NAME                    | PHONE        | ROLE         | SECRET KEY');
  console.log('─────────────────────────────────────────────────────────────────');
  for (const r of results) {
    console.log(
      `${r.name.padEnd(24)}| ${r.phone.padEnd(13)}| ${r.role.padEnd(13)}| ${r.key}`
    );
  }
  console.log('═══════════════════════════════════════════════════\n');

  await pool.end();
}

seed().catch(e => { console.error('Seed failed:', e); process.exit(1); });