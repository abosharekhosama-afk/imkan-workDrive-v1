import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { directionFor, isLocale } from "./locale.ts";

const teamFolderMessageKeys = [
  "nav.teamFolders",
  "teamFolders.heading",
  "teamFolders.empty",
  "teamFolders.members",
  "teamFolders.members.heading",
  "teamFolders.members.empty",
  "teamFolders.member.email",
  "teamFolders.member.role",
  "teamFolders.member.add",
  "teamFolders.member.remove",
  "teamFolders.role.ADMIN",
  "teamFolders.role.ORGANIZER",
  "teamFolders.role.EDITOR",
  "teamFolders.role.VIEWER",
] as const;

function readDictionary(locale: "en" | "ar"): Record<string, string> {
  return JSON.parse(readFileSync(new URL(`./messages/${locale}.json`, import.meta.url), "utf8")) as Record<string, string>;
}

test("Arabic is RTL and English is LTR", () => {
  assert.equal(directionFor("ar"), "rtl");
  assert.equal(directionFor("en"), "ltr");
});

test("isLocale accepts only en and ar", () => {
  assert.equal(isLocale("en"), true);
  assert.equal(isLocale("ar"), true);
  assert.equal(isLocale("fr"), false);
});

test("Team Folder UI keys are localized in English and Arabic", () => {
  const english = readDictionary("en");
  const arabic = readDictionary("ar");

  for (const key of teamFolderMessageKeys) {
    assert.match(english[key] ?? "", /\S/);
    assert.match(arabic[key] ?? "", /\S/);
  }
});

test("English and Arabic dictionaries have identical key sets", () => {
  const english = Object.keys(readDictionary("en")).sort();
  const arabic = Object.keys(readDictionary("ar")).sort();
  assert.deepEqual(arabic, english);
});

test("Organization and admin UI keys are localized in both languages", () => {
  const english = readDictionary("en");
  const arabic = readDictionary("ar");
  const requiredKeys = [
    "nav.organization",
    "org.myWorkDrive",
    "org.noOtherOrgs",
    "files.itemsCount",
    "admin.consoleMeta",
    "admin.subtitle",
    "admin.storageHealth",
    "admin.securityPolicy",
    "admin.groups",
    "admin.auditTrail",
  ] as const;

  for (const key of requiredKeys) {
    assert.match(english[key] ?? "", /\S/);
    assert.match(arabic[key] ?? "", /\S/);
  }
});
