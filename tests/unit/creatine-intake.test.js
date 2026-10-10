import test from 'node:test';
import assert from 'node:assert/strict';
import { reportedCreatineGrams, preserveReportedCreatine, createReportedCreatineGuard } from '../../apps/life/js/core/creatine-intake.js';
import { shouldForceAgentLog, forceLogNudgeFor } from '../../apps/life/js/core/log-finalize-detect.js';
test('reported standalone and embedded creatine amounts are recognised without protein grams being misread',()=>{
 for(const [text,grams] of [['i took 10g of creatine',10],['I made a protien water, 1 scoop of the protien water mix and 7g of creatine',7],['Had a smoothie with 30g protein and 5 grams creatine',5],['I took creatine 5 g',5]])assert.equal(reportedCreatineGrams(text),grams);
});
test('questions, future plans, negative reports and compound dose reports are not auto-filled',()=>{
 for(const text of ['Should I take 10g creatine?','I will take 5g creatine','I did not take 5g creatine','I took no creatine, should I take 5g?','I took 5g creatine then 7g creatine','I mixed 5g creatine for tomorrow','I took 30g protein'])assert.equal(reportedCreatineGrams(text),null);
});
test('a real intake report forces the correct logging path even without an explicit log command',()=>{
 assert.equal(shouldForceAgentLog({slug:'brisket',userMessage:'i took 10g of creatine',sawLogEntry:false}),true);
 assert.match(forceLogNudgeFor('brisket','i took 10g of creatine'),/creatine/);
 assert.equal(shouldForceAgentLog({slug:'brisket',userMessage:'should I take 10g creatine?',sawLogEntry:false}),false);
});
test('explicit dose is preserved in the meal proposal and never added as a second linked log',()=>{
 const message='I made a protein water with 1 scoop and 7g of creatine';
 const candidate={type:'meal',fields:{meal:'snack',protein_g:20},notes:'Protein water with creatine'};
 const result=preserveReportedCreatine(candidate,message);assert.equal(result.fields.creatine_g,7);assert.equal(result.fields.protein_g,20);assert.equal(candidate.fields.creatine_g,undefined);
 assert.equal(preserveReportedCreatine({type:'creatine',fields:{grams:5}},message).fields.grams,7);
 assert.deepEqual(preserveReportedCreatine(candidate,'Should I take 7g creatine?'),candidate);
});
test('a plan proposal does not satisfy a reported dose, while meal or standalone does',()=>{
 const args={slug:'brisket',userMessage:'I took 10g creatine',sawLogEntry:true};
 assert.equal(shouldForceAgentLog({...args,loggedTypes:new Set(['creatine_plan'])}),true);
 assert.equal(shouldForceAgentLog({...args,loggedTypes:new Set(['meal','creatine_intake'])}),false);
});

test('one reported dose cannot become both a meal and standalone proposal; invalid proposals do not claim it',()=>{
 const guard=createReportedCreatineGuard('I made water with 7g creatine');
 const meal={type:'meal',fields:{meal:'snack'},notes:'Water with creatine'};
 assert.equal(guard.prepare(meal).candidate.fields.creatine_g,7);
 assert.equal(guard.prepare(meal).error,undefined);
 guard.accept(meal);
 assert.match(guard.prepare({type:'creatine',fields:{dose_key:'second'}}).error,/already/);
 assert.equal(guard.prepare({type:'creatine_plan',fields:{daily_g:5}}).error,undefined);
});

test('unrelated meals remain loggable after the single dose, and corrections are never auto-filled',()=>{
 const message='I had 5g creatine at breakfast and a chicken sandwich for lunch';
 const guard=createReportedCreatineGuard(message);
 const lunch={type:'meal',fields:{meal:'lunch'},notes:'Chicken sandwich'};
 assert.deepEqual(guard.prepare(lunch).candidate,lunch);
 guard.accept(lunch);
 const dose={type:'creatine',fields:{grams:5,dose_key:'breakfast'}};
 assert.equal(guard.prepare(dose).error,undefined);guard.accept(dose);
 assert.deepEqual(guard.prepare(lunch).candidate,lunch);
 assert.equal(reportedCreatineGrams('I took 10g creatine, actually it was 5g'),null);
 const correction={type:'meal',fields:{meal:'breakfast',creatine_g:0}};
 assert.deepEqual(preserveReportedCreatine(correction,'Correct the 5g creatine I took to zero'),correction);
});
