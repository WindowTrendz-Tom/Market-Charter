import "server-only";
import { getTwelveDataApiKey } from "@/lib/env";
import type { DataProvider } from "./types";
import { TwelveDataProvider } from "./twelve-data";

/** Single switch point if the data provider changes. */
export function getDataProvider(): DataProvider {
  return new TwelveDataProvider({ apiKey: getTwelveDataApiKey() });
}
