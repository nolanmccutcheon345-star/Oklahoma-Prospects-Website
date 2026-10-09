import test from "node:test";
import assert from "node:assert/strict";
import {formatClockTime,parseClockTime} from "./time-display";
test("wall clock display uses am/pm, including noon, midnight and ranges", () => {
  assert.equal(formatClockTime("13:00"),"1:00pm");assert.equal(formatClockTime("00:00"),"12:00am");
  assert.equal(formatClockTime("12:00"),"12:00pm");assert.equal(formatClockTime("09:05:00"),"9:05am");
  assert.equal(formatClockTime("16:00–20:00"),"4:00pm–8:00pm");
  assert.equal(formatClockTime("1:00 PM"),"1:00 PM");
  assert.equal(parseClockTime("1:00pm"),"13:00");assert.equal(parseClockTime("12:00am"),"00:00");
  assert.equal(parseClockTime("13:00pm"),null);assert.equal(parseClockTime("9:75am"),null);
});
