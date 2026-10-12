// Historical timetable fixture; the product accepts editable user timetables.
export function manresaTimetable() {
  return {anchor_date:'2026-10-12',anchor_day:1,cycle_length:10,non_school_dates:[],cycle_overrides:{},slots:[
    {day:1,period:'4',start_time:'11:50',end_time:'12:43',room:'A0214'},
    {day:2,period:'5–6',start_time:'13:24',end_time:'15:10',room:'A0214'},
    {day:4,period:'5',start_time:'13:24',end_time:'14:17',room:'A0214'},
    {day:5,period:'5',start_time:'13:24',end_time:'14:17',room:'A0214'},
    {day:6,period:'1',start_time:'08:30',end_time:'09:23',room:'A0214'},
    {day:8,period:'6',start_time:'14:17',end_time:'15:10',room:'A0215'},
    {day:9,period:'4',start_time:'11:50',end_time:'12:43',room:'A0216'},
    {day:10,period:'2',start_time:'09:23',end_time:'10:16',room:'A0214'}]};
}
