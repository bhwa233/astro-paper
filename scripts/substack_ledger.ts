import path from "node:path";
import { readJsonLedger, writeJsonLedger } from "./blog_common.ts";
import { substackLedgerSchema, type SubstackLedger, type SubstackLedgerIssue } from "./substack_contracts.ts";

export function substackLedgerRelPath(publication: string): string {
  return path.join("data", "substack-translations", publication, "issues.json");
}

export function readSubstackLedger(file: string): SubstackLedger {
  return readJsonLedger(file, "Substack translation ledger", { version: 1, issues: [] }, raw => substackLedgerSchema.parse(raw));
}

export function findSubstackIssue(ledger: SubstackLedger, canonicalUrl: string): SubstackLedgerIssue | undefined {
  return ledger.issues.find(issue => issue.canonicalUrl === canonicalUrl);
}

export function upsertSubstackIssue(file: string, issue: SubstackLedgerIssue): void {
  const ledger = readSubstackLedger(file);
  ledger.issues = [...ledger.issues.filter(existing => existing.canonicalUrl !== issue.canonicalUrl), issue].sort((left, right) =>
    left.sourcePublishedAt.localeCompare(right.sourcePublishedAt)
  );
  writeJsonLedger(file, ledger);
}
