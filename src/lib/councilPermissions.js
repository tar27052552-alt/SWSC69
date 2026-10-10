// Matches private.can_manage_department in the database.
export function canManageDepartment(user, departmentId) {
  return Boolean(user && (['admin', 'president'].includes(user.role) || Number(user.deptId) === departmentId));
}

export function canManageCalendar(user) {
  return canManageDepartment(user, 2);
}

export function academicYear(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok', year: 'numeric', month: 'numeric' }).formatToParts(date);
  const year = Number(parts.find(part => part.type === 'year').value);
  const month = Number(parts.find(part => part.type === 'month').value);
  return year + 543 - (month < 5 ? 1 : 0);
}
