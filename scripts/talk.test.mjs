import test from 'node:test';
import assert from 'node:assert/strict';
import {mergeMessages,unreadCount,lastSeenId,newDay,applyReaction,outboxAdd,outboxRemove,fitSize,isUuid} from '../src/talk/model.js';
const at=(min)=>new Date(Date.UTC(2026,10,19,10,min)).toISOString();
const m=(id,sender,min,extra={})=>({id,sender_id:sender,created_at:at(min),kind:'text',body:id,...extra});

test('messages merge in time order, the newest copy of each wins, deletions always win',()=>{
  let list=mergeMessages([],[m('b','o',2),m('a','y',1)]);
  assert.deepEqual(list.map(x=>x.id),['a','b']);
  list=mergeMessages(list,[m('b','o',2,{body:'edited',edited_at:at(5)})]);
  assert.equal(list.find(x=>x.id==='b').body,'edited');
  list=mergeMessages(list,[{id:'b',deleted_at:at(6),body:null,payload:null}]);
  assert.ok(list.find(x=>x.id==='b').deleted_at);assert.equal(list.find(x=>x.id==='b').body,null);
  assert.equal(list.length,2);assert.equal(list.find(x=>x.id==='b').sender_id,'o','a deletion keeps who sent it');
  assert.deepEqual(mergeMessages(list,[null,{}]).length,2,'junk is ignored');
});
test('unread: the partner’s messages after my read mark; seen: my last message before theirs',()=>{
  const list=[m('1','y',1),m('2','o',2),m('3','y',3),m('4','y',4,{deleted_at:at(5)}),m('5','o',6)];
  assert.equal(unreadCount(list,'o',at(1)),1,'message 3 (4 is deleted)');
  assert.equal(unreadCount(list,'o',null),2);
  assert.equal(lastSeenId(list,'o',at(3)),'2');assert.equal(lastSeenId(list,'o',at(7)),'5');assert.equal(lastSeenId(list,'o',null),null);
});
test('a new day starts a date line',()=>{
  assert.ok(newDay(null,m('a','o',1)));assert.ok(!newDay(m('a','o',1),m('b','o',59)));
  assert.ok(newDay({created_at:'2026-11-18T23:00:00Z'},{created_at:'2026-11-20T01:00:00Z'}));
});
test('one reaction each, changed or taken away',()=>{
  let r=applyReaction({},{message_id:'a',profile_id:'o',emoji:'❤️'});
  r=applyReaction(r,{message_id:'a',profile_id:'y',emoji:'😂'});r=applyReaction(r,{message_id:'a',profile_id:'o',emoji:'🔥'});
  assert.deepEqual(r,{a:{o:'🔥',y:'😂'}});
  assert.deepEqual(applyReaction(r,{message_id:'a',profile_id:'o',emoji:null}),{a:{y:'😂'}});
});
test('the outbox keeps one copy of each unsent message, at most 50',()=>{
  let box=outboxAdd([],{id:'x'});box=outboxAdd(box,{id:'x',body:'again'});assert.equal(box.length,1);assert.equal(box[0].body,'again');
  for(let i=0;i<60;i++)box=outboxAdd(box,{id:'n'+i});assert.equal(box.length,50);
  assert.equal(outboxRemove(box,'n59').length,49);
  assert.ok(isUuid(crypto.randomUUID()));assert.ok(!isUuid('nope'));
});
test('photos travel small: the longest side becomes 1600 px',()=>{
  assert.deepEqual(fitSize(4032,3024),{w:1600,h:1200});assert.deepEqual(fitSize(800,600),{w:800,h:600});assert.deepEqual(fitSize(0,10),{w:0,h:0});
});
