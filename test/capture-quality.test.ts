import {test} from 'node:test';
import assert from 'node:assert/strict';
import {captureIssue,isUniformCapture} from '../src/lib/capture-quality.ts';
test('capture suitability refuses low resolution, phone layouts and excessive pixel counts',()=>{
 assert.equal(captureIssue(300,200),'small');
 assert.equal(captureIssue(750,1334),'portrait');
 assert.equal(captureIssue(10000,10000),'large');
 assert.equal(captureIssue(1440,900),null);
 assert.equal(captureIssue(1440,10000),null);
 assert.equal(captureIssue(640,320),null);
});

test('abstains on blank and transparent captures without rejecting contrasting content',()=>{
 assert.equal(isUniformCapture([255,255,255,255,255,255,255,255]),true);
 assert.equal(isUniformCapture([0,0,0,0,255,0,0,0]),true);
 assert.equal(isUniformCapture([0,0,0,255,255,255,255,255]),false);
 assert.equal(isUniformCapture([12,12,12,255,15,15,15,255]),true);
});
