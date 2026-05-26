export const SUBCATS = {
  'Sales':                  ['Inquiry','Quotation','Order Processing','Customer Visit','Follow-up','Demo / Presentation','After Order Support','Complaint Handling','Collection','Other'],
  'Finance':                ['Invoice Processing','Payment Follow-up','Bank Reconciliation','GST / Tax Filing','Salary Processing','Expense Voucher','Audit Preparation','MIS Report','Petty Cash','Other'],
  'Procurement':            ['Vendor Enquiry','Purchase Order','GRN / Material Receipt','Price Negotiation','Vendor Evaluation','Return / Rejection','Stock Reconciliation','Other'],
  'Operations / Production':['Pending','Under Procurement','Drawing Review','Work in Progress','Wiring','Busbar Work','Component Fitting','Testing','Inspection','Packing','Ready for Dispatch','Field Work','Rework','Other'],
  'Store':                  ['Material Inward','Material Outward','Stock Check','Bin Location Update','Damage Report','Dispatch Packing','Item Return','Other'],
  'Logistics':              ['Dispatch Preparation','Loading','Vehicle Coordination','POD Collection','Cleaning / Maintenance','Other'],
  'Development':            ['New Program','Debugging','PLC Programming','VFD / Servo Setup','Panel Testing','Site Commissioning','Documentation','Repetitive Support','Other'],
  'HR':                     ['Recruitment','Onboarding','Attendance / Leave','Payroll Input','Training','Appraisal','Policy Update','Grievance','Other'],
  'Design':                 ['New Drawing','Drawing Revision','BOM Preparation','3D Modelling','Design Review','Other'],
  'QC / Testing':           ['Incoming Inspection','In-process QC','Final Testing','Calibration','NCR / Rejection','Customer Sign-off','Other'],
  'After Sales / Service':  ['AMC','Breakdown Call','Site Visit','Spare Part Supply','Training at Site','Warranty Claim','Other'],
  'Admin':                  ['Office Management','Utility Bill','Vendor Meeting','Document Filing','IT Support','Facility Maintenance','Other'],
  'Other':                  ['General','Meeting','Report','Other'],
};

export const CATEGORIES = Object.keys(SUBCATS);

export const DEPARTMENTS = [
  'Sales','Finance','Procurement','Operations','Store','Logistics','Development','HR','Admin'
];
