import request from "supertest";
import app from "../app";
import { prisma } from "../db";

const runId = Date.now().toString().slice(-6);
const phone1 = `771${runId}11`;
const phone2 = `772${runId}22`;
const pin = "1234";

async function register(phone: string) {
  const res = await request(app).post("/auth/register").send({ phone, pin });
  expect([200, 201, 409]).toContain(res.status);
  if (res.status !== 409) {
    expect(res.body.ok).toBe(true);
  }
}

async function login(phone: string): Promise<string> {
  const res = await request(app).post("/auth/login").send({ phone, pin });
  expect(res.status).toBe(200);
  expect(res.body.ok).toBe(true);
  expect(typeof res.body.token).toBe("string");
  expect(res.body.token.length).toBeGreaterThan(20);
  return res.body.token;
}

async function getWallet(token: string) {
  const res = await request(app).get("/wallet").set("Authorization", `Bearer ${token}`);
  expect(res.status).toBe(200);
  expect(res.body.ok).toBe(true);
  return res.body.wallet;
}

async function getSystemWallet() {
  const res = await request(app).get("/dev/system-wallet");
  expect(res.status).toBe(200);
  expect(res.body.ok).toBe(true);
  return res.body.wallet;
}

describe("Transactions", () => {
  beforeAll(async () => {
    await request(app).post("/dev/bootstrap-system");
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  test("deposit augmente user et baisse system", async () => {
    await register(phone1);
    const token = await login(phone1);

    const wBefore = await getWallet(token);
    const sBefore = await getSystemWallet();

    const dep = await request(app)
      .post("/transactions/deposit")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", `idem-deposit-1-${runId}`)
      .send({ amount: 1000 });

    expect([200, 201]).toContain(dep.status);
    expect(dep.body.ok).toBe(true);
    expect(dep.body.transaction.type).toBe("DEPOSIT");

    const wAfter = await getWallet(token);
    const sAfter = await getSystemWallet();

    expect(BigInt(wAfter.balance)).toBe(BigInt(wBefore.balance) + 1000n);
    expect(BigInt(sAfter.balance)).toBe(BigInt(sBefore.balance) - 1000n);
  });

  test("idempotence deposit ne double pas", async () => {
    const token = await login(phone1);

    const wBefore = await getWallet(token);
    const idemKey = `idem-deposit-2-${runId}`;
    const body = { amount: 500 };

    const r1 = await request(app)
      .post("/transactions/deposit")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", idemKey)
      .send(body);

    expect([200, 201]).toContain(r1.status);

    const r2 = await request(app)
      .post("/transactions/deposit")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", idemKey)
      .send(body);

    // selon ton middleware: replay (200/201) ou conflit
    expect([200, 201, 409]).toContain(r2.status);

    const wAfter = await getWallet(token);
    expect(BigInt(wAfter.balance)).toBe(BigInt(wBefore.balance) + 500n);
  });

  test("withdraw baisse user et augmente system", async () => {
    const token = await login(phone1);

    // Assure du solde
    await request(app)
      .post("/transactions/deposit")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", `idem-deposit-3-${runId}`)
      .send({ amount: 1000 });

    const wBefore = await getWallet(token);
    const sBefore = await getSystemWallet();

    const wd = await request(app)
      .post("/transactions/withdraw")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", `idem-withdraw-1-${runId}`)
      .send({ amount: 700 });

    expect([200, 201]).toContain(wd.status);
    expect(wd.body.ok).toBe(true);
    expect(wd.body.transaction.type).toBe("WITHDRAW");

    const wAfter = await getWallet(token);
    const sAfter = await getSystemWallet();

    expect(BigInt(wAfter.balance)).toBe(BigInt(wBefore.balance) - 700n);
    expect(BigInt(sAfter.balance)).toBe(BigInt(sBefore.balance) + 700n);
  });

  test("transfer bouge les 2 wallets", async () => {
    await register(phone2);
    const token1 = await login(phone1);
    const token2 = await login(phone2);

    // Donne du solde à user1
    await request(app)
      .post("/transactions/deposit")
      .set("Authorization", `Bearer ${token1}`)
      .set("Idempotency-Key", `idem-deposit-4-${runId}`)
      .send({ amount: 2000 });

    const w1Before = await getWallet(token1);
    const w2Before = await getWallet(token2);
const sBefore = await getSystemWallet();


    const tr = await request(app)
      .post("/transactions/transfer")
      .set("Authorization", `Bearer ${token1}`)
      .set("Idempotency-Key", `idem-transfer-1-${runId}`)
      .send({ toWalletId: w2Before.id, amount: 1000 });

    expect([200, 201]).toContain(tr.status);
    expect(tr.body.ok).toBe(true);
    expect(tr.body.transaction.type).toBe("TRANSFER");

    const w1After = await getWallet(token1);
    const w2After = await getWallet(token2);
const sAfter = await getSystemWallet();

    expect(BigInt(w1After.balance)).toBe(BigInt(w1Before.balance) - 1010n); // 1000 + 10 de frais
expect(BigInt(w2After.balance)).toBe(BigInt(w2Before.balance) + 1000n);
expect(BigInt(sAfter.balance)).toBe(BigInt(sBefore.balance) + 10n);
  });
});