const DAY_MS = 86400000;
const TIME = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
export function dateNumber(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('Use a valid date.');
  const n = Date.parse(value + 'T00:00:00Z');
  if (!Number.isFinite(n) || new Date(n).toISOString().slice(0,10) !== value) throw new Error('Use a valid date.');
  return n / DAY_MS;
}
const ymd = n => new Date(n * DAY_MS).toISOString().slice(0,10);
const weekday = n => ![0,6].includes(new Date(n * DAY_MS).getUTCDay());
const wrap = (day, length) => ((day - 1) % length + length) % length + 1;
export const sessionKey = row => row.date + '_' + row.start_time.replace(':','');

export function validateTimetable(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Choose or enter a class timetable.');
  const { anchor_date, anchor_day, cycle_length, slots } = input;
  const anchor = dateNumber(anchor_date);
  if (!Number.isInteger(cycle_length) || cycle_length < 1 || cycle_length > 20 || !Number.isInteger(anchor_day) || anchor_day < 1 || anchor_day > cycle_length) throw new Error('Cycle days must fit the cycle length (1–20).');
  if (!Array.isArray(slots) || !slots.length || slots.length > 100) throw new Error('Add between 1 and 100 teaching times.');
  const normalized = slots.map(slot => {
    if (!slot || !Number.isInteger(slot.day) || slot.day < 1 || slot.day > cycle_length || !TIME.test(slot.start_time) || !TIME.test(slot.end_time) || slot.start_time >= slot.end_time) throw new Error('Each teaching time needs a valid day, start and later end time.');
    if ((slot.period != null && typeof slot.period !== 'string') || (slot.room != null && typeof slot.room !== 'string')) throw new Error('Period and room must be text.');
    return { day:slot.day, start_time:slot.start_time, end_time:slot.end_time, period:(slot.period ?? '').trim().slice(0,40), room:(slot.room ?? '').trim().slice(0,80) };
  }).sort((a,b)=>a.day-b.day || a.start_time.localeCompare(b.start_time));
  normalized.forEach((slot,i)=>{
    const prev=normalized[i-1];
    if (prev && prev.day===slot.day && prev.end_time>slot.start_time) throw new Error('Teaching times on the same cycle day must not overlap.');
  });
  const non_school_dates=input.non_school_dates ?? [];
  if (!Array.isArray(non_school_dates) || non_school_dates.length>1000) throw new Error('Enter non-school dates as a list.');
  non_school_dates.forEach(dateNumber);
  if (!weekday(anchor) || non_school_dates.includes(anchor_date)) throw new Error('The anchor must be a school day.');
  const cycle_overrides=input.cycle_overrides ?? {};
  if (!cycle_overrides || typeof cycle_overrides!=='object' || Array.isArray(cycle_overrides) || Object.keys(cycle_overrides).length>100) throw new Error('Enter valid cycle corrections.');
  for(const [date,day] of Object.entries(cycle_overrides)) {
    const n=dateNumber(date);
    if (!weekday(n) || non_school_dates.includes(date) || !Number.isInteger(day) || day<1 || day>cycle_length || (date===anchor_date && day!==anchor_day)) throw new Error('A cycle correction must name a school day and valid cycle day.');
  }
  return {anchor_date,anchor_day,cycle_length,slots:normalized,non_school_dates:[...new Set(non_school_dates)].sort(),cycle_overrides:{...cycle_overrides}};
}

export function generateTimetableSessions(input, startDate, endDate) {
  const tt=validateTimetable(input);
  const start=dateNumber(startDate), end=dateNumber(endDate), anchor=dateNumber(tt.anchor_date);
  if (end<start || end-start>365 || Math.abs(start-anchor)>3660 || Math.abs(end-anchor)>3660) throw new Error('Choose a range of at most one year, within ten years of the anchor.');
  const excluded=new Set(tt.non_school_dates);
  const isSchool=n=>weekday(n)&&!excluded.has(ymd(n));
  const first=Math.min(start,anchor,...Object.keys(tt.cycle_overrides).map(dateNumber));
  if (anchor-first>3660) throw new Error('Cycle corrections must be within ten years of the anchor.');
  let day=tt.anchor_day;
  for(let n=first;n<anchor;n++) if(isSchool(n)) day=wrap(day-1,tt.cycle_length);
  const rows=[];
  for(let n=first;n<=end;n++) {
    if(!isSchool(n)) continue;
    const date=ymd(n);
    if(date===tt.anchor_date) day=tt.anchor_day;
    if(tt.cycle_overrides[date]) day=tt.cycle_overrides[date];
    if(n>=start) for(const slot of tt.slots.filter(s=>s.day===day)) {
      rows.push({date,cycle_day:day,start_time:slot.start_time,end_time:slot.end_time,period:slot.period,room:slot.room});
    }
    day=wrap(day+1,tt.cycle_length);
  }
  return rows;
}

// Import explicit session rows, never silently drop an unreadable line.
export function parseTimetableText(text, cycleLength) {
  const slots=[];
  for(const [index, raw] of String(text).split(/\r?\n/).entries()) {
    const line=raw.trim();
    if(!line || /^day\s*[,|\t].*start/i.test(line)) continue;
    const fail=()=>{throw new Error(`Line ${index+1}: use day, period, start–end time and optional room.`);};
    const day=line.match(/^(?:day\s*)?(\d{1,2})\b[\s,|]*(.*)$/i);
    if(!day) fail();
    const times=[...day[2].matchAll(/(?<!\d)(\d{1,2})[:.](\d{2})(?!\d)(?: *(am|pm))?/gi)];
    if(times.length!==2 || Boolean(times[0][3])!==Boolean(times[1][3])) fail();
    const clock=match=>{
      let h=Number(match[1]);const m=Number(match[2]), meridiem=match[3]?.toLowerCase();
      if(m>59 || (meridiem ? h<1 || h>12 : h>23)) fail();
      if(meridiem) h=h%12+(meridiem==='pm'?12:0);
      return String(h).padStart(2,'0')+':'+String(m).padStart(2,'0');
    };
    const start_time=clock(times[0]),end_time=clock(times[1]);
    if(Number(day[1])<1 || Number(day[1])>cycleLength || start_time>=end_time) fail();
    const clean=value=>value.trim().replace(/^[,|\s]+|[,|\s]+$/g,'');
    const period=clean(day[2].slice(0,times[0].index)).replace(/^(?:period|p)\s*/i,'');
    if(period && !/^\d+(?:\s*[-–]\s*\d+)?$/.test(period)) fail();
    const between=day[2].slice(times[0].index+times[0][0].length,times[1].index);
    if(!/^[-–—,|\s]+$/.test(between) && between.trim().toLowerCase()!=='to') fail();
    const suffix=day[2].slice(times[1].index+times[1][0].length);
    if(suffix && !/^[\s,|]/.test(suffix)) fail();
    const room=clean(suffix).replace(/^room\s+/i,'');
    slots.push({day:Number(day[1]),period,start_time,end_time,room});
  }
  if(!slots.length) throw new Error('Paste at least one teaching session with a day and start–end time.');
  // Reuse the same overlap and size validation as manual entry.
  return validateTimetable({anchor_date:'2000-01-03',anchor_day:1,cycle_length:cycleLength,slots}).slots;
}
