// System constants (Departments and Roles configuration)
export const DEPARTMENTS = [
  { id: 1,  name: 'ฝ่ายการเงินและพัสดุ',             short: 'การเงิน',   color: '#10b981', bg: 'rgba(16,185,129,0.15)'  },
  { id: 2,  name: 'ฝ่ายปกครอง',                      short: 'ปกครอง',   color: '#ef4444', bg: 'rgba(239,68,68,0.15)'   },
  { id: 3,  name: 'ฝ่ายวิชาการ',                     short: 'วิชาการ',  color: '#6366f1', bg: 'rgba(99,102,241,0.15)'  },
  { id: 4,  name: 'ฝ่ายสำนักงานคณะกรรมการนักเรียน', short: 'สนง.',     color: '#f59e0b', bg: 'rgba(245,158,11,0.15)'  },
  { id: 5,  name: 'ฝ่ายประชาสัมพันธ์',              short: 'PR',       color: '#ec4899', bg: 'rgba(236,72,153,0.15)'  },
  { id: 6,  name: 'ฝ่ายนันทนาการและเครือข่ายชุมชน', short: 'นันทนา',  color: '#06b6d4', bg: 'rgba(6,182,212,0.15)'   },
  { id: 7,  name: 'ฝ่ายเลขานุการ',                  short: 'เลขา',    color: '#8b5cf6', bg: 'rgba(139,92,246,0.15)'  },
  { id: 8,  name: 'ฝ่ายอาคารสถานที่',               short: 'อาคาร',   color: '#84cc16', bg: 'rgba(132,204,22,0.15)'  },
  { id: 9,  name: 'ฝ่ายโสตทัศนศึกษา',              short: 'โสต',     color: '#f97316', bg: 'rgba(249,115,22,0.15)'  },
  { id: 10, name: 'ฝ่ายปฏิคม',                      short: 'ปฏิคม',   color: '#14b8a6', bg: 'rgba(20,184,166,0.15)'  },
];

export const ROLES = {
  ADMIN: 'admin',
  PRESIDENT: 'president',
  DEPT_HEAD: 'dept_head',
  MEMBER: 'member',
};
