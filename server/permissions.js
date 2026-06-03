const PERMISSIONS = [
  // Analytics
  { key: 'view_reports',       label: 'View Reports',           group: 'Analytics',  defaults: ['superadmin'] },
  { key: 'view_profitability', label: 'View Profitability',     group: 'Analytics',  defaults: ['superadmin'] },
  { key: 'view_salary',        label: 'View Salary Data',       group: 'Analytics',  defaults: ['superadmin'] },
  { key: 'view_irc',           label: 'View IRC Daily Rate',    group: 'Analytics',  defaults: ['superadmin','admin'] },
  { key: 'export_reports',     label: 'Export Reports',         group: 'Analytics',  defaults: ['superadmin'] },
  // Tickets
  { key: 'create_ticket',      label: 'Create Tickets',         group: 'Tickets',    defaults: ['superadmin','admin'] },
  { key: 'assign_workers',     label: 'Assign Workers',         group: 'Tickets',    defaults: ['superadmin','admin'] },
  { key: 'close_ticket',       label: 'Close Tickets',          group: 'Tickets',    defaults: ['superadmin','admin'] },
  { key: 'reopen_ticket',      label: 'Reopen Tickets',         group: 'Tickets',    defaults: ['superadmin','admin'] },
  { key: 'view_all_tickets',   label: 'View All Tickets',       group: 'Tickets',    defaults: ['superadmin','admin'] },
  { key: 'delete_ticket',      label: 'Delete Tickets',         group: 'Tickets',    defaults: ['superadmin'] },
  // Billing
  { key: 'enter_billing',      label: 'Enter Customer Charges', group: 'Billing',    defaults: ['superadmin','admin'] },
  { key: 'view_billing',       label: 'View Billing Details',   group: 'Billing',    defaults: ['superadmin','admin'] },
  { key: 'edit_rate_card',     label: 'Edit Rate Card',         group: 'Billing',    defaults: ['superadmin'] },
  // Workers
  { key: 'start_timer',        label: 'Start Work Timer',       group: 'Workers',    defaults: ['superadmin','admin','plc','wireman'] },
  { key: 'upload_files',       label: 'Upload Completion Files',group: 'Workers',    defaults: ['superadmin','admin','plc','wireman'] },
  { key: 'view_worker_costs',  label: 'View Worker Costs',      group: 'Workers',    defaults: ['superadmin'] },
  // Users
  { key: 'manage_users',       label: 'Manage Users & Keys',    group: 'Users',      defaults: ['superadmin'] },
  { key: 'view_sessions',      label: 'View All Sessions',      group: 'Users',      defaults: ['superadmin'] },
  { key: 'reset_keys',         label: 'Reset Secret Keys',      group: 'Users',      defaults: ['superadmin'] },
  // Customers
  { key: 'manage_customers',   label: 'Manage Party Master',    group: 'Customers',  defaults: ['superadmin'] },
  { key: 'view_customers',     label: 'View Customer List',     group: 'Customers',  defaults: ['superadmin','admin'] },
];

module.exports = PERMISSIONS;
