import {test} from 'node:test';
import assert from 'node:assert/strict';
import {captureIssue} from '../src/lib/capture-quality.ts';
test('capture suitability refuses low resolution, phone layouts and excessive pixel counts',()=>{
 assert.equal(captureIssue(300,200),'small');
 assert.equal(captureIssue(750,1334),'portrait');
 assert.equal(captureIssue(10000,10000),'large');
 assert.equal(captureIssue(1440,900),null);
 assert.equal(captureIssue(1440,10000),null);
 assert.equal(captureIssue(640,320),null);
});
