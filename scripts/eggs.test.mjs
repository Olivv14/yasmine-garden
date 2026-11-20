// Easter eggs: when they happen, and the "days together" count on Us.
import test from 'node:test';
import assert from 'node:assert/strict';
import {isGreenHour,isMoonTime,nightKey,wordIn,shakeDetector,proverbFor,navSequence} from '../src/eggs/eggs.js';
import {daysTogether} from '../src/us/us-hero.js';
import {moonPhase,isFullMoon,moonLight} from '../src/garden3d/sky.js';

test('green hour is 11:11, morning or night, and only that minute',()=>{
  assert.ok(isGreenHour(new Date(2026,10,20,11,11)));assert.ok(isGreenHour(new Date(2026,10,20,23,11)));
  assert.ok(!isGreenHour(new Date(2026,10,20,11,12)));assert.ok(!isGreenHour(new Date(2026,10,20,12,11)));
});
test('the moon comes after midnight, once a night',()=>{
  assert.ok(isMoonTime(new Date(2026,10,21,0,30)));assert.ok(!isMoonTime(new Date(2026,10,21,7)));
  assert.equal(nightKey(new Date(2026,10,21,0,30)),nightKey(new Date(2026,10,21,3,50)));
});
test('the secret words are found inside a message, not inside other words',()=>{
  assert.ok(wordIn('mi Nejma ✨','nejma'));assert.ok(wordIn('REGENBOGEN!','regenbogen'));assert.ok(!wordIn('nejmas','nejma'));assert.ok(!wordIn(null,'nejma'));
});
test('a shake needs several strong moves in a short time',()=>{
  const shake=shakeDetector();let hit=false;
  for(let i=0;i<8;i++)hit=shake({x:i%2?20:-20,y:0,z:9.8},i*100)||hit;assert.ok(hit);
  const calm=shakeDetector();let still=false;for(let i=0;i<8;i++)still=calm({x:.1*i,y:0,z:9.8},i*100)||still;assert.ok(!still);
});
test('days together count from the day you set',()=>{
  assert.equal(daysTogether('2026-04-20',new Date(2026,3,20,22).getTime()),0);
  assert.equal(daysTogether('2026-04-20',new Date(2026,10,20,9).getTime()),214);
  assert.equal(daysTogether(null),null);
});
test('the moon in the garden is the real moon',()=>{
  assert.ok(isFullMoon(new Date(Date.UTC(2026,0,3,10))),'3 January 2026 was a full moon');
  assert.ok(moonPhase(new Date(Date.UTC(2026,0,18,19)))<.03||moonPhase(new Date(Date.UTC(2026,0,18,19)))>.97,'18 January 2026 was a new moon');
  const full=moonLight(.5);assert.ok(full[2]>.99);const nw=moonLight(0);assert.ok(nw[2]<-.99);assert.ok(moonLight(.25)[0]>.99);
});
test('a proverb on Fridays only, the same all day, changing week to week',()=>{
  assert.equal(proverbFor(new Date(2026,10,19)),null);const f=proverbFor(new Date(2026,10,20,8));assert.ok(f>=1&&f<=6);
  assert.equal(proverbFor(new Date(2026,10,20,23)),f);assert.notEqual(proverbFor(new Date(2026,10,27)),f);
});
test('the secret dance: Home, Talk, Play, Learn, Us, quickly',()=>{
  const seq=navSequence();let hit=false;['garden','talk','play','learn','us'].forEach((p,i)=>{hit=seq(p,i*400)||hit;});assert.ok(hit);
  const slow=navSequence();let late=false;['garden','talk','play','learn','us'].forEach((p,i)=>{late=slow(p,i*2000)||late;});assert.ok(!late);
});
