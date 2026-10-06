import type { PrismaClient } from "@prisma/client";
import { costOf, type Prices, type UsageContext, type UsageEntry } from "./usage.js";

/** Schreibt Verbrauchseintraege in die Datenbank; die Website wird bei Bedarf aus Beitrag oder Upload ermittelt. */
export function createUsageSink(prisma: PrismaClient, prices: Prices) {
  return async (entry: UsageEntry, context: UsageContext): Promise<void> => {
    let siteId = context.siteId;
    if (!siteId && context.postId) siteId = (await prisma.post.findUnique({ where: { id: context.postId }, select: { siteId: true } }))?.siteId;
    if (!siteId && context.submissionId) siteId = (await prisma.submission.findUnique({ where: { id: context.submissionId }, select: { siteId: true } }))?.siteId;
    await prisma.aiUsage.create({
      data: {
        step: entry.step,
        model: entry.model,
        siteId: siteId ?? null,
        postId: context.postId ?? null,
        submissionId: context.submissionId ?? null,
        inputTokens: entry.inputTokens,
        outputTokens: entry.outputTokens,
        cacheReadTokens: entry.cacheReadTokens,
        cacheWriteTokens: entry.cacheWriteTokens,
        webSearches: entry.webSearches,
        costUsd: costOf(entry, prices),
      },
    });
  };
}
