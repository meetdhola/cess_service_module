/**
 * node server/db/init.js
 * Creates tables and seeds all 75 preset users.
 */
require('dotenv').config();
const fs   = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const pool = require('./pool');

const PRESET = [
  { name:'Divy Shah',             dept:'Sales',       role:'MD & Sales Head',            pass:'divy123',          adminLevel:'master' },
  { name:'Chirag Shah',           dept:'Finance',     role:'MD & Finance Head',           pass:'chirag123',        adminLevel:'master' },
  { name:'Harish Joshi',          dept:'Procurement', role:'MD & Procurement Head',       pass:'harish123',        adminLevel:'master' },
  { name:'Jayesh Patel',          dept:'Operations',  role:'Operations Head',             pass:'jayesh123',        adminLevel:'sub'    },
  { name:'Francis Rathod',        dept:'Store',       role:'Store Head – Panel',          pass:'francis123',       adminLevel:'sub'    },
  { name:'Ajay Chauhan',          dept:'Logistics',   role:'Logistics Head',              pass:'ajay123',          adminLevel:'sub'    },
  { name:'Bhavesh Prajapati',     dept:'Development', role:'Development Head',            pass:'bhavesh123',       adminLevel:'sub'    },
  { name:'Ketan Tundiya',         dept:'Sales',       role:'Sr. Sales Engineer',          pass:'ketan123',         adminLevel:'sub'    },
  { name:'Viral Trivedi',         dept:'HR',          role:'HR Head',                     pass:'viral123',         adminLevel:'sub'    },
  { name:'Chetankumar Shah',      dept:'Sales',       role:'Sales Engineer',              pass:'chetan123',        adminLevel:null     },
  { name:'Pankaj Rana',           dept:'Sales',       role:'Sales Engineer',              pass:'pankajr123',       adminLevel:null     },
  { name:'Vivardhan Gandhi',      dept:'Sales',       role:'Sales Engineer',              pass:'vivardhan123',     adminLevel:null     },
  { name:'Nikita Koshti',         dept:'Sales',       role:'Sales Coord. – Panel',        pass:'nikita123',        adminLevel:null     },
  { name:'Yogita Shah',           dept:'Sales',       role:'Sales Coord. – Trading',      pass:'yogita123',        adminLevel:null     },
  { name:'Shivani Shakyawar',     dept:'Sales',       role:'Project Coordinator',         pass:'shivani123',       adminLevel:null     },
  { name:'Sejal Prajapati',       dept:'Sales',       role:'Mgmt. Assistant',             pass:'sejal123',         adminLevel:null     },
  { name:'Pankaj Joshi',          dept:'Finance',     role:'Senior Accountant',           pass:'pankajj123',       adminLevel:null     },
  { name:'Alpesh Raval',          dept:'Finance',     role:'Accountant',                  pass:'alpesh123',        adminLevel:null     },
  { name:'Bharat A. Shah',        dept:'Finance',     role:'Cash Handling',               pass:'bharat123',        adminLevel:null     },
  { name:'Manoj Parmar',          dept:'Finance',     role:'Accountant',                  pass:'manoj123',         adminLevel:null     },
  { name:'Sojitra Pooja',         dept:'Finance',     role:'Accountant',                  pass:'pooja123',         adminLevel:null     },
  { name:'Hiren Joshi',           dept:'Procurement', role:'Purchase Head – Trading',     pass:'hiren123',         adminLevel:null     },
  { name:'Jagdish Parmar',        dept:'Procurement', role:'Purchase Head – Panel',       pass:'jagdish123',       adminLevel:null     },
  { name:'Kaushal Patel',         dept:'Operations',  role:'Service Head',                pass:'kaushal123',       adminLevel:null     },
  { name:'Amit Soni',             dept:'Operations',  role:'Design Head',                 pass:'amit123',          adminLevel:null     },
  { name:'Rahul Nishad',          dept:'Operations',  role:'Jr. Designer',                pass:'rahul123',         adminLevel:null     },
  { name:'Bhavana Chaure',        dept:'Operations',  role:'Jr. Designer',                pass:'bhavana123',       adminLevel:null     },
  { name:'Udit Prasad',           dept:'Operations',  role:'Sr. Testing Engineer',        pass:'udit123',          adminLevel:null     },
  { name:'Ajay Oza',              dept:'Operations',  role:'Asst. Production Mgr.',       pass:'ajayoza123',       adminLevel:null     },
  { name:'Jaydip Patel',          dept:'Operations',  role:'Field Supervisor',            pass:'jaydip123',        adminLevel:null     },
  { name:'Ajit Chauhan',          dept:'Operations',  role:'Busbar+Fitter',               pass:'ajitc123',         adminLevel:null     },
  { name:'Alpesh Solanki',        dept:'Operations',  role:'Sr. Wireman',                 pass:'alpeshs123',       adminLevel:null     },
  { name:'Batuk Thakor',          dept:'Operations',  role:'Busbar+Fitter',               pass:'batuk123',         adminLevel:null     },
  { name:'Chaudhary Jignesh',     dept:'Operations',  role:'Field Wireman',               pass:'jignesh123',       adminLevel:null     },
  { name:'Chauhan Khengarsinh',   dept:'Operations',  role:'Jr. Wireman',                 pass:'khengars123',      adminLevel:null     },
  { name:'Dabhi Sanjaykumar',     dept:'Operations',  role:'Office Wireman',              pass:'sanjay123',        adminLevel:null     },
  { name:'Himmat Parmar',         dept:'Operations',  role:'Field Wireman',               pass:'himmat123',        adminLevel:null     },
  { name:'Kalabhai Dabhi',        dept:'Operations',  role:'Sr. Wireman',                 pass:'kalabhai123',      adminLevel:null     },
  { name:'Makwana Govindbhai',    dept:'Operations',  role:'Sr. Wireman',                 pass:'govindbhai123',    adminLevel:null     },
  { name:'Mangesh Chaudhary',     dept:'Operations',  role:'Sr. Wireman',                 pass:'mangesh123',       adminLevel:null     },
  { name:'Parmar Jayntibhai',     dept:'Operations',  role:'Jr. Wireman',                 pass:'jayntibhai123',    adminLevel:null     },
  { name:'Parmar Rahulsinh',      dept:'Operations',  role:'Field Wireman',               pass:'rahulsinh123',     adminLevel:null     },
  { name:'Prajapati Siddharaj',   dept:'Operations',  role:'Jr. Wireman',                 pass:'siddharaj123',     adminLevel:null     },
  { name:'Priti Koshti',          dept:'Operations',  role:'Wire Harnessing',             pass:'priti123',         adminLevel:null     },
  { name:'Shaileshkumar Patel',   dept:'Operations',  role:'Sr. Wireman',                 pass:'shailesh123',      adminLevel:null     },
  { name:'Sujal Parmar',          dept:'Operations',  role:'Office Wireman',              pass:'sujal123',         adminLevel:null     },
  { name:'Dheeraj Singh',         dept:'Operations',  role:'Field Wireman',               pass:'dheeraj123',       adminLevel:null     },
  { name:'Kumarbhargav Parmar',   dept:'Store',       role:'Store Head – Trading',        pass:'kumarbhargav123',  adminLevel:null     },
  { name:'Bhavanbhai Solanki',    dept:'Store',       role:'Helper',                      pass:'bhavanbhai123',    adminLevel:null     },
  { name:'Chauhan Tushar',        dept:'Store',       role:'Helper',                      pass:'tushar123',        adminLevel:null     },
  { name:'Rathod Jayantibhai',    dept:'Store',       role:'Helper',                      pass:'rjayantibhai123',  adminLevel:null     },
  { name:'Vishal Parmar',         dept:'Store',       role:'Helper',                      pass:'vishal123',        adminLevel:null     },
  { name:'Malek Irfan',           dept:'Store',       role:'Sr. Helper',                  pass:'irfan123',         adminLevel:null     },
  { name:'Thakor Raksit',         dept:'Store',       role:'Helper',                      pass:'raksit123',        adminLevel:null     },
  { name:'Fernandez Stancy',      dept:'Logistics',   role:'Cleaning',                    pass:'stancy123',        adminLevel:null     },
  { name:'Hansaben Chauhan',      dept:'Logistics',   role:'Cleaning',                    pass:'hansaben123',      adminLevel:null     },
  { name:'Ravi Panchal',          dept:'Development', role:'Motion Head',                 pass:'ravi123',          adminLevel:null     },
  { name:'Kushal Mehta',          dept:'Development', role:'Developer',                   pass:'kushal123',        adminLevel:null     },
  { name:'Sunil Patel',           dept:'Development', role:'Developer',                   pass:'sunilp123',        adminLevel:null     },
  { name:'Tirth Joshi',           dept:'Development', role:'Developer',                   pass:'tirth123',         adminLevel:null     },
  { name:'Hardik Panchal',        dept:'Development', role:'New Dev. Head',               pass:'hardik123',        adminLevel:null     },
  { name:'Devang Patel',          dept:'Development', role:'Sr. Dev.',                    pass:'devang123',        adminLevel:null     },
  { name:'Durgesh Sharma',        dept:'Development', role:'Sr. Dev.',                    pass:'durgesh123',       adminLevel:null     },
  { name:'Sunil Prajapati',       dept:'Development', role:'Sr. Dev.',                    pass:'sunilpraj123',     adminLevel:null     },
  { name:'Vaibhav Gajjar',        dept:'Development', role:'Jr. Dev.',                    pass:'vaibhav123',       adminLevel:null     },
  { name:'Jha Dhruv',             dept:'Development', role:'Jr. Dev.',                    pass:'dhruv123',         adminLevel:null     },
  { name:'Neel Suthar',           dept:'Development', role:'Jr. Dev.',                    pass:'neel123',          adminLevel:null     },
  { name:'Vireshwar Raval',       dept:'Development', role:'Jr. Dev.',                    pass:'vireshwar123',     adminLevel:null     },
  { name:'Chirag Patel',          dept:'Development', role:'Repeat Support & Testing',    pass:'chiragp123',       adminLevel:null     },
  { name:'Manju Prajapati',       dept:'Development', role:'Support Dev.',                pass:'manju123',         adminLevel:null     },
  { name:'Hemant Patel',          dept:'Development', role:'VFD & Servo Head',            pass:'hemant123',        adminLevel:null     },
  { name:'Ritesh Valand',         dept:'Development', role:'Sr. Dev.',                    pass:'ritesh123',        adminLevel:null     },
  { name:'Sahil Prajapati',       dept:'Development', role:'Jr. Dev.',                    pass:'sahil123',         adminLevel:null     },
  { name:'Chandresh Patel',       dept:'Development', role:'Repairing Head',              pass:'chandresh123',     adminLevel:null     },
  { name:'Mitesh Panchal',        dept:'Development', role:'Repairing',                   pass:'mitesh123',        adminLevel:null     },
];

const DEFAULT_TEAMS = {
  'Jayesh Patel':      ['Kaushal Patel','Amit Soni','Rahul Nishad','Bhavana Chaure','Udit Prasad','Ajay Oza','Jaydip Patel','Ajit Chauhan','Alpesh Solanki','Batuk Thakor','Chaudhary Jignesh','Chauhan Khengarsinh','Dabhi Sanjaykumar','Himmat Parmar','Kalabhai Dabhi','Makwana Govindbhai','Mangesh Chaudhary','Parmar Jayntibhai','Parmar Rahulsinh','Prajapati Siddharaj','Priti Koshti','Shaileshkumar Patel','Sujal Parmar','Dheeraj Singh'],
  'Francis Rathod':    ['Kumarbhargav Parmar','Bhavanbhai Solanki','Chauhan Tushar','Rathod Jayantibhai','Vishal Parmar','Malek Irfan','Thakor Raksit'],
  'Ajay Chauhan':      ['Fernandez Stancy','Hansaben Chauhan'],
  'Bhavesh Prajapati': ['Ravi Panchal','Kushal Mehta','Sunil Patel','Tirth Joshi','Hardik Panchal','Devang Patel','Durgesh Sharma','Sunil Prajapati','Vaibhav Gajjar','Jha Dhruv','Neel Suthar','Vireshwar Raval','Chirag Patel','Manju Prajapati','Hemant Patel','Ritesh Valand','Sahil Prajapati','Chandresh Patel','Mitesh Panchal'],
  'Ketan Tundiya':     ['Chetankumar Shah','Pankaj Rana','Vivardhan Gandhi','Nikita Koshti','Yogita Shah','Shivani Shakyawar','Sejal Prajapati'],
  'Viral Trivedi':     [],
};

async function init() {
  const client = await pool.connect();
  try {
    const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
    await client.query(schema);
    console.log('✅ Schema created');

    for (const u of PRESET) {
      const hash = await bcrypt.hash(u.pass, 10);
      await client.query(
        `INSERT INTO users (name, department, role, password, admin_level)
         VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (name) DO NOTHING`,
        [u.name, u.dept, u.role, hash, u.adminLevel || null]
      );
    }
    console.log(`✅ Seeded ${PRESET.length} users`);

    for (const [subAdmin, members] of Object.entries(DEFAULT_TEAMS)) {
      for (const member of members) {
        await client.query(
          `INSERT INTO teams (sub_admin, member) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
          [subAdmin, member]
        );
      }
    }
    console.log('✅ Seeded default teams');
  } finally {
    client.release();
    await pool.end();
  }
}

init().catch(err => { console.error(err); process.exit(1); });
