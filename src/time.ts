export function currentTime(timeZone?: string, now = new Date()) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    fractionalSecondDigits: 3,
    hourCycle: 'h23',
    timeZoneName: 'longOffset',
  });
  const parts = Object.fromEntries(formatter.formatToParts(now).map(({ type, value }) => [type, value]));
  const offset = parts.timeZoneName.replace('GMT', '') || '+00:00';
  // POSIX TZ settings can leave the resolved zone absent or its offset reversed.
  const zone = formatter.resolvedOptions().timeZone;
  return {
    current_time: `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}.${parts.fractionalSecond}${offset}`,
    time_zone: zone && !/^[+-]/.test(zone) ? zone : offset,
  };
}
