export function calculateSeasonApiIds(seasonNumber: number) {
  const normal = 1401 + (seasonNumber - 12) * 100;
  return { normal, expert: normal + 30 };
}

export function beijingToday(): string {
  return new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export function beijingDateToUnix(date: string): number {
  return Math.floor(new Date(`${date}T00:00:00+08:00`).getTime() / 1000);
}
