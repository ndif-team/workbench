"use server";

import type { NewConfig } from "@/db/schema";
import { requireUserId } from "@/lib/auth/user";
import * as configDb from "@/lib/queries/configDb";

/**
 * The config RPC surface. Every export is a public endpoint: it resolves the
 * signed-in user and acts only on the configs of their charts (the unguarded
 * internals live in configDb.ts).
 */

/** Saves the payload and type of the config of one of the signed-in user's charts. */
export async function setConfig(configId: string, config: NewConfig): Promise<void> {
    return configDb.setConfig(await requireUserId(), configId, config);
}
