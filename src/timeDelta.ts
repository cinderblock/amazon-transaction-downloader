export function absTimeDelta(date1: string | Date, date2: string | Date) {
  return Math.abs(timeDelta(date1, date2));
}

export function timeDelta(date1: string | Date, date2: string | Date) {
  const a = new Date(date1);
  const b = new Date(date2);
  return a.getTime() - b.getTime();
}
