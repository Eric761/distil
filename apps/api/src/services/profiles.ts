import { buildFixtures, type ResolvedProfile } from "@invoice/fixtures";
import type { SampleDescriptor } from "@invoice/contracts";
import { NON_INVOICE_DEMOS } from "../db/demo-documents.js";

let cache: ResolvedProfile[] | null = null;

export async function getProfiles(): Promise<ResolvedProfile[]> {
  if (!cache) {
    cache = await buildFixtures();
  }
  return cache;
}

export async function getProfileBySha(sha256: string): Promise<ResolvedProfile | null> {
  const profiles = await getProfiles();
  return profiles.find((p) => p.sha256 === sha256) ?? null;
}

export async function getProfileByFixtureId(fixtureId: string): Promise<ResolvedProfile | null> {
  const profiles = await getProfiles();
  return profiles.find((p) => p.fixtureId === fixtureId) ?? null;
}

export async function getSamples(): Promise<SampleDescriptor[]> {
  const profiles = await getProfiles();
  return [
    ...NON_INVOICE_DEMOS.map((demo) => ({
      fixtureId: demo.id,
      title: demo.title,
      vendorName: "Generic document",
      scenario: demo.scenario,
      demonstrates: demo.demonstrates,
    })),
    ...profiles.map((p) => ({
      fixtureId: p.fixtureId,
      title: p.descriptor.title,
      vendorName: p.descriptor.vendorName,
      scenario: p.descriptor.scenario,
      demonstrates: p.descriptor.demonstrates,
    })),
  ];
}
