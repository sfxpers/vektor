import { describe, expect, it } from "vite-plus/test";

import type { Database } from "@/db";
import { user } from "@/db/schema/auth";
import { companies } from "@/db/schema/company";
import { companyCredits } from "@/db/schema/credits";
import { eftPayments, type EftPaymentInsert } from "@/db/schema/eft";
import { referrals } from "@/db/schema/referral";
import { entryByLookup } from "@/lib/billing-catalog";
import { getCredits, setCredits } from "@/lib/credits";
import { confirmEft } from "@/lib/eft.server";
import { claimPendingReferralRewards, maybeRewardReferrerOnPaidEft, myStats } from "@/lib/referral";

import { createTestDb } from "../helpers/test-db";

// V01: admin EFT confirmation must make the referral reward durable and
// retryable. Assertions go through the public confirmEft/getCredits/myStats
// seams — never tables or private helpers.

const ADMIN = "admin-1";

async function seedUsers(db: Database) {
  const now = new Date();
  await db.insert(user).values([
    {
      id: "referrer",
      name: "Referrer",
      email: "referrer@example.com",
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "referee",
      name: "Referee",
      email: "referee@example.com",
      createdAt: now,
      updatedAt: now,
    },
  ]);
  await db.insert(companies).values({
    id: "referee-company",
    userId: "referee",
    companyName: "Referee Co",
    cipcNum: "2026/123456/07",
    createdAt: now,
    updatedAt: now,
  });
  await db
    .insert(companyCredits)
    .values({ companyId: "referee-company", credits: 5, updatedAt: now });
  await db.insert(referrals).values({
    id: "referral",
    referrerUserId: "referrer",
    refereeUserId: "referee",
    refereeEmail: "referee@example.com",
    code: "VEK-ABC123",
    createdAt: now,
  });
}

async function seedReferrerCompany(db: Database) {
  const now = new Date();
  await db.insert(companies).values({
    id: "referrer-company",
    userId: "referrer",
    companyName: "Referrer Co",
    cipcNum: "2026/654321/07",
    createdAt: now,
    updatedAt: now,
  });
  await db
    .insert(companyCredits)
    .values({ companyId: "referrer-company", credits: 5, updatedAt: now });
}

async function seedPayment(
  db: Database,
  fields: Pick<EftPaymentInsert, "id" | "reference" | "lookupKey" | "credits"> &
    Partial<EftPaymentInsert>,
) {
  const now = new Date();
  await db.insert(eftPayments).values({
    userId: "referee",
    userEmail: "referee@example.com",
    companyId: "referee-company",
    companyName: "Referee Co",
    packageName: "Pro",
    amount: entryByLookup(fields.lookupKey)!.amount_cents,
    billingPeriod: "monthly",
    type: "subscription",
    status: "pending_review",
    createdAt: now,
    updatedAt: now,
    ...fields,
  });
}

// A real SQLite constraint failure INSIDE the reward batch — the credit
// upsert runs, the reward-ledger insert aborts, and the whole batch rolls
// back. Test-only DDL on the freshly created in-memory fixture.
async function failNextRewardGrant(db: Database) {
  await db.$client.batch([
    db.$client
      .prepare(
        `CREATE TRIGGER test_fail_referral_reward BEFORE INSERT ON referral_rewards
         BEGIN SELECT RAISE(ABORT, 'fixture referral persistence failure'); END;`,
      )
      .bind(),
  ]);
}

async function restoreRewardGrant(db: Database) {
  await db.$client.batch([db.$client.prepare("DROP TRIGGER test_fail_referral_reward;").bind()]);
}

const confirmInput = (paymentId: string) => ({ paymentId, adminUserId: ADMIN });

describe("EFT admin confirmation", () => {
  it("keeps the payment durable on a reward failure and completes it on retry", async () => {
    const db = createTestDb();
    await seedUsers(db);
    await seedReferrerCompany(db);
    await seedPayment(db, {
      id: "payment-pro",
      reference: "VEK-PRO001",
      lookupKey: "tc_pro_monthly_v2",
      credits: 20,
    });

    await failNextRewardGrant(db);
    const first = await confirmEft(db, confirmInput("payment-pro"));
    expect(first).toMatchObject({
      ok: true,
      newlyConfirmed: true,
      referralPending: true,
      payment: { status: "confirmed" },
    });
    expect(await getCredits(db, "referee-company")).toBe(25);
    expect(await getCredits(db, "referrer-company")).toBe(5);

    await restoreRewardGrant(db);
    const retry = await confirmEft(db, confirmInput("payment-pro"));
    expect(retry).toMatchObject({ ok: true, newlyConfirmed: false, referralPending: false });
    expect(await getCredits(db, "referee-company")).toBe(25);
    expect(await getCredits(db, "referrer-company")).toBe(10);
    const stats = await myStats(db, "referrer");
    expect(stats.credits_earned).toBe(5);
    expect(stats.subscribed_count).toBe(1);

    const again = await confirmEft(db, confirmInput("payment-pro"));
    expect(again).toMatchObject({ ok: true, newlyConfirmed: false, referralPending: false });
    expect(await getCredits(db, "referee-company")).toBe(25);
    expect(await getCredits(db, "referrer-company")).toBe(10);
  });

  it("a later confirmed payment cannot overwrite the pinned first-paid reward", async () => {
    const db = createTestDb();
    await seedUsers(db);
    await seedReferrerCompany(db);
    await seedPayment(db, {
      id: "payment-pro",
      reference: "VEK-PRO001",
      lookupKey: "tc_pro_monthly_v2",
      credits: 20,
    });
    await seedPayment(db, {
      id: "payment-scale",
      reference: "VEK-SCALE1",
      lookupKey: "tc_scale_monthly_v2",
      credits: 50,
    });

    await failNextRewardGrant(db);
    await confirmEft(db, confirmInput("payment-pro"));
    await restoreRewardGrant(db);

    const scale = await confirmEft(db, confirmInput("payment-scale"));
    expect(scale).toMatchObject({ ok: true, newlyConfirmed: true, referralPending: false });
    // Pro's 5-credit reward wins — not Scale's 10.
    expect(await getCredits(db, "referee-company")).toBe(75);
    expect(await getCredits(db, "referrer-company")).toBe(10);

    const retry = await confirmEft(db, confirmInput("payment-pro"));
    expect(retry).toMatchObject({ ok: true, newlyConfirmed: false, referralPending: false });
    expect(await getCredits(db, "referee-company")).toBe(75);
    expect(await getCredits(db, "referrer-company")).toBe(10);
  });

  it("grants credits and the reward exactly once under concurrent confirms", async () => {
    const db = createTestDb();
    await seedUsers(db);
    await seedReferrerCompany(db);
    await seedPayment(db, {
      id: "payment-pro",
      reference: "VEK-PRO001",
      lookupKey: "tc_pro_monthly_v2",
      credits: 20,
    });

    const results = await Promise.all([
      confirmEft(db, confirmInput("payment-pro")),
      confirmEft(db, confirmInput("payment-pro")),
    ]);
    expect(results.every((r) => r.ok)).toBe(true);
    expect(results.filter((r) => r.ok && r.newlyConfirmed)).toHaveLength(1);
    expect(await getCredits(db, "referee-company")).toBe(25);
    expect(await getCredits(db, "referrer-company")).toBe(10);
    expect((await myStats(db, "referrer")).credits_earned).toBe(5);
  });

  it("parks the reward when the referrer has no company, claimable once", async () => {
    const db = createTestDb();
    await seedUsers(db);
    await seedPayment(db, {
      id: "payment-pro",
      reference: "VEK-PRO001",
      lookupKey: "tc_pro_monthly_v2",
      credits: 20,
    });

    const first = await confirmEft(db, confirmInput("payment-pro"));
    expect(first).toMatchObject({ ok: true, newlyConfirmed: true, referralPending: false });
    expect(await getCredits(db, "referee-company")).toBe(25);

    await seedReferrerCompany(db);
    const claimed = await claimPendingReferralRewards(db, {
      referrerUserId: "referrer",
      referrerCompanyId: "referrer-company",
    });
    expect(claimed).toEqual([
      expect.objectContaining({ granted: true, credits: 5, plan_lookup_key: "tc_pro_monthly_v2" }),
    ]);
    expect(await getCredits(db, "referrer-company")).toBe(10);
    expect(
      await claimPendingReferralRewards(db, {
        referrerUserId: "referrer",
        referrerCompanyId: "referrer-company",
      }),
    ).toEqual([]);
    expect(await getCredits(db, "referrer-company")).toBe(10);
  });

  it("grants PAYG credits without any referral reward", async () => {
    const db = createTestDb();
    await seedUsers(db);
    await seedReferrerCompany(db);
    await seedPayment(db, {
      id: "payment-payg",
      reference: "VEK-PAYG01",
      lookupKey: "tc_credits_1_v2",
      credits: 1,
      billingPeriod: "one_time",
      type: "one_time",
      packageName: "Credit",
    });

    const result = await confirmEft(db, confirmInput("payment-payg"));
    expect(result).toMatchObject({ ok: true, newlyConfirmed: true, referralPending: false });
    expect(await getCredits(db, "referee-company")).toBe(6);
    expect(await getCredits(db, "referrer-company")).toBe(5);
    expect((await myStats(db, "referrer")).credits_earned).toBe(0);
  });

  it("prefers the pinned original plan when a retry passes later args", async () => {
    const db = createTestDb();
    await seedUsers(db);
    await seedReferrerCompany(db);
    await seedPayment(db, {
      id: "payment-pro",
      reference: "VEK-PRO001",
      lookupKey: "tc_pro_monthly_v2",
      credits: 20,
    });

    await failNextRewardGrant(db);
    await confirmEft(db, confirmInput("payment-pro")); // durable pin survives
    await restoreRewardGrant(db);

    // Public reward seam called directly with a LATER payment's args — the
    // durable pin, not these args, must shape the completed reward.
    const reward = await maybeRewardReferrerOnPaidEft(db, {
      refereeUserId: "referee",
      isSubscription: false,
      triggerReference: "VEK-PAYG99",
      planLookupKey: "tc_credits_1_v2",
    });
    expect(reward).toEqual({
      granted: true,
      credits: 5,
      referrer_user_id: "referrer",
      plan_lookup_key: "tc_pro_monthly_v2",
      type: "first_paid_subscription",
    });
    expect(await getCredits(db, "referee-company")).toBe(25);
    expect(await getCredits(db, "referrer-company")).toBe(10);
  });

  it("recovers a pre-patch confirmed payment's pinned reward on retry", async () => {
    const db = createTestDb();
    await seedUsers(db);
    await seedReferrerCompany(db);
    // Pre-patch state: both payments already confirmed, no pin was ever
    // written, and the balances were settled without any reward.
    await seedPayment(db, {
      id: "payment-pro",
      reference: "VEK-PRO001",
      lookupKey: "tc_pro_monthly_v2",
      credits: 20,
      status: "confirmed",
      confirmedAt: new Date("2026-01-10T00:00:00Z"),
    });
    await seedPayment(db, {
      id: "payment-scale",
      reference: "VEK-SCALE1",
      lookupKey: "tc_scale_monthly_v2",
      credits: 50,
      status: "confirmed",
      confirmedAt: new Date("2026-02-10T00:00:00Z"),
    });
    await setCredits(db, "referee-company", 75);

    const scale = await confirmEft(db, confirmInput("payment-scale"));
    expect(scale).toMatchObject({ ok: true, newlyConfirmed: false, referralPending: false });
    // Earliest confirmed subscription wins: Pro's 5 reward, not Scale's 10.
    expect(await getCredits(db, "referee-company")).toBe(75);
    expect(await getCredits(db, "referrer-company")).toBe(10);

    const pro = await confirmEft(db, confirmInput("payment-pro"));
    expect(pro).toMatchObject({ ok: true, newlyConfirmed: false, referralPending: false });
    expect(await getCredits(db, "referee-company")).toBe(75);
    expect(await getCredits(db, "referrer-company")).toBe(10);
  });

  it("refuses states that cannot confirm and changes no balances", async () => {
    const db = createTestDb();
    await seedUsers(db);
    await seedReferrerCompany(db);
    await seedPayment(db, {
      id: "payment-rejected",
      reference: "VEK-REJ001",
      lookupKey: "tc_pro_monthly_v2",
      credits: 20,
      status: "rejected",
    });

    expect(await confirmEft(db, confirmInput("payment-rejected"))).toEqual({
      ok: false,
      status: 400,
      detail: "Payment must be in pending_review, currently rejected",
    });
    expect(await confirmEft(db, confirmInput("payment-missing"))).toEqual({
      ok: false,
      status: 404,
      detail: "Payment not found",
    });
    expect(await getCredits(db, "referee-company")).toBe(5);
    expect(await getCredits(db, "referrer-company")).toBe(5);
  });
});
