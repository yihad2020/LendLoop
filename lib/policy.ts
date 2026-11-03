export type LoanStatus = "pending" | "approved" | "declined" | "cancelled" | "returned";
export type Role = "user" | "admin";
export const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function validateDateRange(start: string, end: string, today: string): void {
  if (!ISO_DATE.test(start) || !ISO_DATE.test(end) ||
      new Date(`${start}T00:00:00.000Z`).toISOString().slice(0, 10) !== start ||
      new Date(`${end}T00:00:00.000Z`).toISOString().slice(0, 10) !== end) {
    throw new Error("Dates must be valid ISO calendar dates.");
  }
  if (start < today) throw new Error("Start date must not be in the past.");
  if (end < start) throw new Error("End date must be on or after start date.");
  const duration = (Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86400000;
  if (duration > 30) throw new Error("A loan cannot exceed 31 calendar days.");
}
export function overlaps(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return aStart <= bEnd && bStart <= aEnd;
}
export function mayManageListing(role: Role, userId: string, ownerId: string): boolean {
  return role === "admin" || userId === ownerId;
}
export function canTransition(
  status: LoanStatus, next: LoanStatus, actor: "lender" | "borrower",
): boolean {
  if (status === "pending") return (actor === "lender" && (next === "approved" || next === "declined")) || (actor === "borrower" && next === "cancelled");
  if (status === "approved") return (actor === "lender" && next === "returned");
  return false;
}
export function dateTodayUTC(timestamp = Date.now()): string {
  return new Date(timestamp).toISOString().slice(0, 10);
}
export function reminderKey(requestId: string, day: string): string {
  return `overdue:${requestId}:${day}`;
}
