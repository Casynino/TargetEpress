import "server-only";

import { prisma } from "@/lib/prisma";

export const SETTING_KEYS = {
  defaultRatePerKg: "pricing.defaultRatePerKg",
} as const;

export async function getSetting(key: string, fallback: string) {
  const row = await prisma.setting.findUnique({ where: { key } });
  return row?.value ?? fallback;
}

export async function getDefaultRatePerKg() {
  return getSetting(SETTING_KEYS.defaultRatePerKg, "0");
}
