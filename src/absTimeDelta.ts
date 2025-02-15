export function absTimeDelta(date1: string | Date, date2: string | Date) {
  const a = new Date(date1);
  const b = new Date(date2);

  return Math.abs(a.getTime() - b.getTime());
}
