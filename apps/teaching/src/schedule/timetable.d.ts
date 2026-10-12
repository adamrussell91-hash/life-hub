export interface TimetableSlot { day:number; start_time:string; end_time:string; period?:string; room?:string }
export interface ClassTimetable { anchor_date:string; anchor_day:number; cycle_length:number; slots:TimetableSlot[]; non_school_dates:string[]; cycle_overrides:Record<string,number> }
export interface TimetableSession { date:string; cycle_day:number; start_time:string; end_time:string; period:string; room:string }
export function dateNumber(value:string):number;
export function sessionKey(row:{date:string;start_time:string}):string;
export function validateTimetable(input:unknown):ClassTimetable;
export function generateTimetableSessions(input:unknown,startDate:string,endDate:string):TimetableSession[];


export function parseTimetableText(text:string,cycleLength:number):TimetableSlot[];
