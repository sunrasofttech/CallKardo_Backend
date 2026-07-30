const dateObj = new Date('2026-07-30T14:00:00+05:30');

const formattedDate = new Intl.DateTimeFormat('en-IN', {
  weekday: 'long',
  year: 'numeric',
  month: 'long',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Asia/Kolkata',
}).format(dateObj);

console.log(formattedDate);
