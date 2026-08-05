/**
 * Unit tests for Prolific param parsing + survey-URL pass-through.
 */

import { describe, it, expect } from "bun:test";
import { parseProlificParams, withProlificPid } from "@/lib/prolific";

describe("parseProlificParams", () => {
    it("reads canonical UPPER_CASE keys", () => {
        expect(
            parseProlificParams({ PROLIFIC_PID: "p1", STUDY_ID: "s1", SESSION_ID: "x1" }),
        ).toEqual({ prolificPid: "p1", studyId: "s1", sessionId: "x1" });
    });

    it("accepts lower_case defensively and trims", () => {
        expect(parseProlificParams({ prolific_pid: "  p1  " })).toEqual({ prolificPid: "p1" });
    });

    it("collapses repeated params to the first value", () => {
        expect(parseProlificParams({ PROLIFIC_PID: ["p1", "p2"] })).toEqual({ prolificPid: "p1" });
    });

    it("returns null when nothing is present (store nothing, not {})", () => {
        expect(parseProlificParams({})).toBeNull();
        expect(parseProlificParams({ PROLIFIC_PID: "  " })).toBeNull();
    });
});

describe("withProlificPid", () => {
    it("appends PROLIFIC_PID to a bare survey URL", () => {
        expect(withProlificPid("https://survey.qualtrics.com/jfe/form/SV_x", "p1")).toBe(
            "https://survey.qualtrics.com/jfe/form/SV_x?PROLIFIC_PID=p1",
        );
    });

    it("merges with an existing query string rather than clobbering it", () => {
        expect(withProlificPid("https://survey.example.com/s?foo=bar", "p1")).toBe(
            "https://survey.example.com/s?foo=bar&PROLIFIC_PID=p1",
        );
    });

    it("overwrites a stale PROLIFIC_PID instead of duplicating it", () => {
        expect(withProlificPid("https://survey.example.com/s?PROLIFIC_PID=old", "new")).toBe(
            "https://survey.example.com/s?PROLIFIC_PID=new",
        );
    });

    it("URL-encodes the pid value", () => {
        expect(withProlificPid("https://survey.example.com/s", "a b&c")).toBe(
            "https://survey.example.com/s?PROLIFIC_PID=a+b%26c",
        );
    });

    it("passes the URL through untouched when no pid is set", () => {
        const url = "https://survey.example.com/s";
        expect(withProlificPid(url, undefined)).toBe(url);
        expect(withProlificPid(url, "")).toBe(url);
    });

    it("passes through when there is no survey URL", () => {
        expect(withProlificPid(undefined, "p1")).toBeUndefined();
        expect(withProlificPid("", "p1")).toBe("");
    });

    it("returns a non-absolute/malformed URL unchanged", () => {
        expect(withProlificPid("/relative/survey", "p1")).toBe("/relative/survey");
        expect(withProlificPid("not a url", "p1")).toBe("not a url");
    });
});
