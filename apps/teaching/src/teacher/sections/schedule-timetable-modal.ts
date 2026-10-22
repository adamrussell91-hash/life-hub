import { apiGet } from '@/api/client';
import { applyScheduledUnitResult } from '@/app/curriculum-state';
import { generateTimetableSessions, validateTimetable, parseTimetableText, sessionKey, type ClassTimetable, type TimetableSession } from '@/schedule/timetable';
import { resolveScheduleToday } from '@/schedule/today';
import { postScheduleTimetable, type TimetableScheduleResult } from '@/teacher/schedule-api';
import type { CurriculumResponse } from '@/teacher/nav';
import { formatDisplayDate } from '../../../design-kit/js/format-display-date.js';
import { parseSchoolTerms } from '../../../design-kit/js/calendar/school-terms.js';

export function openScheduleTimetableModal(options: {
  curriculum: CurriculumResponse;
  classId?: string;
  unitId?: string;
  onSuccess?: (result: TimetableScheduleResult) => void | Promise<void>;
}): { close: () => void } {
  const { curriculum } = options;
  const classes = curriculum.classes.filter(cls => cls.status === 'active' && (!options.unitId || curriculum.units.find(u=>u.id===options.unitId)?.subject_id===cls.subject_id));
  let classId = options.classId ?? classes[0]?.id ?? '';
  let unitId = options.unitId ?? '';
  const cls = () => classes.find(c=>c.id===classId);
  let timetable: ClassTimetable = structuredClone(cls()?.timetable ?? {anchor_date:resolveScheduleToday(curriculum.schedule_anchor_date),anchor_day:1,cycle_length:10,slots:[],non_school_dates:[],cycle_overrides:{}});
  let startDate = resolveScheduleToday(curriculum.schedule_anchor_date);
  const addDays = (date:string, n:number) => new Date(Date.parse(date+'T00:00:00Z')+n*86400000).toISOString().slice(0,10);
  let endDate = addDays(startDate,6);
  let pastedText = '';
  let useExisting = false, preview = false, submitting = false, closed = false;
  let sessions: TimetableSession[] = [];
  const omitted = new Set<string>();
  const priorFocus=document.activeElement as HTMLElement | null;
  const backdrop=document.createElement('div');backdrop.className='schedule-modal timetable-modal';
  const dialog=document.createElement('div');dialog.className='schedule-modal__dialog';dialog.dataset.timetableDialog='';
  dialog.setAttribute('role','dialog');dialog.setAttribute('aria-modal','true');dialog.setAttribute('aria-labelledby','timetable-title');dialog.tabIndex=-1;
  const title=document.createElement('h2');title.id='timetable-title';title.className='schedule-modal__title';title.textContent='Schedule lessons';
  const error=document.createElement('p');error.className='schedule-modal__error';error.setAttribute('role','alert');error.hidden=true;
  const body=document.createElement('div');body.className='schedule-modal__body';
  const footer=document.createElement('div');footer.className='schedule-modal__footer';footer.dataset.part='form-actions';
  dialog.append(title,error,body,footer);backdrop.append(dialog);document.body.append(backdrop);
  const close=()=>{if(submitting)return;closed=true;document.removeEventListener('keydown',onKey);backdrop.remove();priorFocus?.focus();};
  const onKey=(event:KeyboardEvent)=>{
    if(event.key==='Escape' && !(event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLSelectElement)){event.preventDefault();close();}
    if(event.key==='Tab'){
      const items=[...dialog.querySelectorAll<HTMLElement>('button:not([disabled]),input:not([disabled]),textarea,select')];
      const first=items[0],last=items.at(-1);
      if(event.shiftKey && (document.activeElement===first || document.activeElement===dialog)){event.preventDefault();last?.focus();}
      else if(!event.shiftKey && document.activeElement===last){event.preventDefault();first?.focus();}
    }
  };
  document.addEventListener('keydown',onKey);backdrop.addEventListener('click',e=>{if(e.target===backdrop)close();});
  const showError=(message:string)=>{error.hidden=false;error.textContent=message;};
  const button=(label:string,action:string,click:()=>void,primary=false)=>{
    const b=document.createElement('button');b.type='button';b.className='btn '+(primary?'btn--primary':'btn--ghost');b.textContent=label;b.dataset.timetableAction=action;b.addEventListener('click',click);return b;
  };
  const field=(label:string,name:string,type:string,value:string,change:(value:string)=>void,parent:HTMLElement=body)=>{
    const l=document.createElement('label');l.className='schedule-modal__field';
    const caption=document.createElement('span');caption.textContent=label;
    const input=document.createElement('input');input.type=type;input.value=value;input.dataset.timetableField=name;input.className='schedule-modal__date';
    if(type==='number'){input.min='1';input.max='20';}
    input.addEventListener('change',()=>change(input.value));l.append(caption,input);parent.append(l);return input;
  };
  const note=(text:string)=>{const p=document.createElement('p');p.className='schedule-modal__empty';p.textContent=text;body.append(p);};
  const terms: Array<{term:number|null;starts_on:string;ends_on:string}>=curriculum.scope_sequences.flatMap(scope=>scope.terms.filter(t=>t.start_date&&t.end_date).map(t=>({term:t.term_number,starts_on:t.start_date!,ends_on:t.end_date!})));
  const renderTimes=()=>{
    const host=document.createElement('div');host.className='timetable-times';
    timetable.slots.forEach((slot,index)=>{
      const row=document.createElement('div');row.className='timetable-time-row';row.dataset.timetableTimeRow=String(index);
      field('Day','day-'+index,'number',String(slot.day),v=>slot.day=Number(v),row);
      field('Period','period-'+index,'text',slot.period ?? '',v=>slot.period=v,row);
      field('Start','start-'+index,'time',slot.start_time,v=>slot.start_time=v,row);
      field('End','end-'+index,'time',slot.end_time,v=>slot.end_time=v,row);
      field('Room','room-'+index,'text',slot.room ?? '',v=>slot.room=v,row);
      const remove=button('Remove','remove-'+index,()=>{timetable.slots.splice(index,1);render();});remove.setAttribute('aria-label','Remove teaching time '+(index+1));row.append(remove);host.append(row);
    });
    body.append(host,button('Add teaching time','add-time',()=>{timetable.slots.push({day:1,start_time:'08:30',end_time:'09:23',period:'',room:''});render();}));
  };
  const render=()=>{
    body.replaceChildren();footer.replaceChildren();
    title.textContent=preview?'Preview calendar lessons':'Schedule lessons';
    if(preview){
      note((cls()?.title || cls()?.code || '')+' · '+(curriculum.units.find(u=>u.id===unitId)?.title ?? ''));
      const count=document.createElement('p');count.setAttribute('aria-live','polite');body.append(count);
      const updateCount=()=>{count.textContent=(sessions.length-omitted.size)+' lessons selected. Unwritten sessions get blank drafts.';};updateCount();
      const scheduled=curriculum.scheduled_lessons.filter(r=>r.class_id===classId);
      const list=document.createElement('ul');list.className='schedule-modal__preview-list';
      sessions.forEach(slot=>{
        const item=document.createElement('li');item.className='schedule-modal__preview-item';item.dataset.timetableSlot=sessionKey(slot);
        const label=document.createElement('label');const check=document.createElement('input');check.type='checkbox';check.checked=!omitted.has(sessionKey(slot));check.disabled=submitting;
        check.addEventListener('change',()=>{if(check.checked)omitted.delete(sessionKey(slot));else omitted.add(sessionKey(slot));updateCount();confirm.disabled=omitted.size===sessions.length;});
        const existing=scheduled.find(r=>r.date===slot.date&&r.start_time===slot.start_time);
        const text=formatDisplayDate(slot.date)+' · Day '+slot.cycle_day+' · '+slot.start_time+'–'+slot.end_time+(slot.period?' · P'+slot.period:'')+(slot.room?' · '+slot.room:'')+(existing ? ' · Already on calendar' : '');
        label.append(check,document.createTextNode(text));item.append(label);list.append(item);
      });body.append(list);
      const confirm=button(submitting?'Adding lessons…':'Add lessons to calendar','confirm',()=>{
        if(submitting || omitted.size===sessions.length)return;
        submitting=true;error.hidden=true;render();
        void postScheduleTimetable(classId,{unit_id:unitId,start_date:startDate,end_date:endDate,timetable,omitted_slots:[...omitted],use_existing:useExisting}).then(async result=>{
          applyScheduledUnitResult(result);
          submitting=false;close();
          await options.onSuccess?.(result);
        }).catch(err=>{submitting=false;if(!closed){showError(err instanceof Error?err.message:'Unable to schedule lessons.');render();}});
      },true);confirm.disabled=submitting || omitted.size===sessions.length;
      const back=button('Back','back',()=>{preview=false;render();});back.disabled=submitting;
      const cancel=button('Cancel','cancel',close);cancel.disabled=submitting;footer.append(back,cancel,confirm);
    }else{
      if(!classes.length){note('Create a class for this subject before scheduling lessons.');footer.append(button('Close','cancel',close));return;}
      note('Class');
      const choices=document.createElement('div');choices.className='timetable-choices';
      classes.forEach(c=>{const b=button((c.title||c.code)+' · '+c.code,'class-'+c.id,()=>{pastedText='';classId=c.id;unitId=options.unitId ?? '';timetable=structuredClone(c.timetable ?? {anchor_date:startDate,anchor_day:1,cycle_length:10,slots:[],non_school_dates:[],cycle_overrides:{}});omitted.clear();render();});b.setAttribute('aria-pressed',String(c.id===classId));choices.append(b);});body.append(choices);
      if(options.unitId) note('Unit: '+(curriculum.units.find(u=>u.id===options.unitId)?.title ?? ''));
      else note('Unit');
      const units=curriculum.units.filter(u=>u.status==='active'&&u.kind!=='program'&&u.subject_id===cls()?.subject_id);
      if(!unitId && units.length===1)unitId=units[0]!.id;
      const unitChoices=document.createElement('div');unitChoices.className='timetable-choices';
      if(!options.unitId) units.forEach(u=>{const b=button(u.title,'unit-'+u.id,()=>{unitId=u.id;omitted.clear();render();});b.setAttribute('aria-pressed',String(u.id===unitId));unitChoices.append(b);});if(!options.unitId) body.append(unitChoices);
      if(!units.length)note('Create a unit for this class before scheduling lessons.');
      const ranges=document.createElement('div');ranges.className='timetable-choices';
      ranges.append(button('This week','this-week',()=>{const today=resolveScheduleToday(curriculum.schedule_anchor_date);const day=new Date(today+'T00:00:00Z').getUTCDay();startDate=addDays(today,-((day+6)%7));endDate=addDays(startDate,6);omitted.clear();render();}));
      const unique=new Set<string>();
      terms.forEach(t=>{const key=t.starts_on+t.ends_on;if(unique.has(key))return;unique.add(key);ranges.append(button('Term '+(t.term ?? '')+' · '+formatDisplayDate(t.starts_on),'term-'+key,()=>{startDate=t.starts_on;endDate=t.ends_on;omitted.clear();render();}));});body.append(ranges);
      const dates=document.createElement('div');dates.className='timetable-pair';body.append(dates);
      field('From','start-date','date',startDate,v=>{startDate=v;omitted.clear();},dates);
      field('Through','end-date','date',endDate,v=>{endDate=v;omitted.clear();},dates);
      const pasteLabel=document.createElement('label');pasteLabel.className='schedule-modal__field';
      const pasteCaption=document.createElement('span');pasteCaption.textContent='Paste your class timetable';
      const paste=document.createElement('textarea');paste.className='schedule-modal__date timetable-paste';paste.dataset.timetableField='paste';paste.rows=4;paste.value=pastedText;
      paste.placeholder='Day 1 | P4 | 11:50–12:43 | A0214\nDay 2 | P5–6 | 13:24–15:10 | A0214';
      paste.addEventListener('input',()=>pastedText=paste.value);pasteLabel.append(pasteCaption,paste);body.append(pasteLabel);
      note('One teaching session per line: day, period, start–end time, room. Tabs, commas or | separators work; period and room are optional. Paste only this class’s sessions.');
      body.append(button('Use pasted timetable','import',()=>{
        try { const slots=parseTimetableText(pastedText,timetable.cycle_length);timetable.slots=slots;omitted.clear();error.hidden=true;render(); }
        catch(err){showError(err instanceof Error?err.message:'Check the pasted timetable.');}
      }));
      note('Your timetable is saved on this class when you add lessons. Reopen this scheduler to paste a replacement or edit its times, including splitting a double into two sessions. Existing calendar lessons keep their saved times.');
      const anchor=document.createElement('div');anchor.className='timetable-anchor';body.append(anchor);
      field('Anchor date','anchor-date','date',timetable.anchor_date,v=>timetable.anchor_date=v,anchor);
      field('Anchor day','anchor-day','number',String(timetable.anchor_day),v=>timetable.anchor_day=Number(v),anchor);
      field('Cycle length','cycle-length','number',String(timetable.cycle_length),v=>timetable.cycle_length=Number(v),anchor);
      renderTimes();
      note('Weekends do not advance the cycle. Non-school dates pause it; unchecking a lesson in the preview only omits that lesson.');
      field('Non-school dates (YYYY-MM-DD, separated by commas)','non-school','text',timetable.non_school_dates.join(', '),v=>{timetable.non_school_dates=v.split(/[\s,]+/).filter(Boolean);});
      field('Cycle corrections (YYYY-MM-DD=day, separated by commas)','corrections','text',Object.entries(timetable.cycle_overrides).map(([date,day])=>date+'='+day).join(', '),v=>{
        timetable.cycle_overrides=Object.fromEntries(v.split(/[\s,]+/).filter(Boolean).map(value=>{const [date,day]=value.split('=');return [date,Number(day)];}));
      });
      const existingLabel=document.createElement('label');existingLabel.className='timetable-existing';const existing=document.createElement('input');existing.type='checkbox';existing.checked=useExisting;existing.addEventListener('change',()=>useExisting=existing.checked);existingLabel.append(existing,document.createTextNode('Use existing unscheduled lessons first'));body.append(existingLabel);
      const next=button('Preview lessons','preview',()=>{
        error.hidden=true;
        if(!unitId){showError('Choose a unit.');return;}
        try{timetable=validateTimetable(timetable);sessions=generateTimetableSessions(timetable,startDate,endDate);if(!sessions.length)throw new Error('No teaching sessions fall in this range.');if(sessions.length>500)throw new Error('Choose at most 500 sessions.');preview=true;render();body.scrollTop=0;}catch(err){showError(err instanceof Error?err.message:'Check the timetable.');}
      },true);footer.append(button('Cancel','cancel',close),next);
    }
    if(!submitting)dialog.focus();
  };
  render();
  void apiGet<{school_terms?:unknown}>('/api/hub-prefs').then(prefs=>{
    if(closed)return;terms.push(...parseSchoolTerms(prefs.school_terms));
    // Do not repaint over fields the teacher is editing. Term choices appear on the next render.
  }).catch(()=>{});
  return {close};
}
