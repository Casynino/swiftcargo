"use server";

import bcrypt from "bcryptjs";
import { z } from "zod";

import { signIn } from "@/auth";
import { recordAudit } from "@/lib/audit";
import { consumeCode, issueCode } from "@/lib/customer-activation";
import { normaliseTzPhone, tzPhoneProblem } from "@/lib/phone";
import { prisma } from "@/lib/prisma";
import { authorize } from "@/lib/session";

/*
  THE CUSTOMER'S OWN DOOR: PHONE FIRST, THEN A CODE FROM THE OFFICE.

  Everything here reads the customer from the phone number typed and the code
  given — never an id from the page. A customer registered at the counter gets
  a login attached to THAT record, so their cargo, bills and payments are there
  on the first sign-in; nobody is registered twice.
*/

export type CodeState = { error?: string; ok?: string; code?: string; expiresAt?: string; purpose?: "ACTIVATE" | "RESET" };

/** Staff: give a customer the code that opens, or resets, their portal login. */
export async function issueCustomerCode(_prev: CodeState, formData: FormData): Promise<CodeState> {
  const actor = await authorize("customer.activate");
  const customerId = String(formData.get("customerId") ?? "");
  const customer = await prisma.customer.findFirst({
    where: { id: customerId, deletedAt: null },
    select: { id: true, fullName: true, businessName: true, code: true, login: { select: { id: true, status: true, active: true } } },
  });
  if (!customer) return { error: "That customer is not on the books." };
  if (customer.login && (customer.login.status !== "ACTIVE" || !customer.login.active)) {
    return { error: "This customer's login is suspended, so no code can be given. Re-activate it first." };
  }
  const purpose = customer.login ? "RESET" : "ACTIVATE";
  const { code, expiresAt } = await prisma.$transaction((tx) => issueCode(tx, customer.id, purpose, actor.id));
  await recordAudit({
    actor,
    action: purpose === "ACTIVATE" ? "customer.activation_code" : "customer.reset_code",
    entity: "Customer",
    entityId: customer.id,
    summary: `${purpose === "ACTIVATE" ? "Gave an activation code to" : "Gave a password-reset code to"} ${customer.businessName || customer.fullName} (${customer.code})`,
  });
  return { ok: "Code ready.", code, purpose, expiresAt: expiresAt.toISOString() };
}

export type PhoneStep = { error?: string; step?: "activate" | "login" | "new"; phone?: string };

/** Public, step one: what is this number? Says nothing about the customer beyond that. */
export async function checkPhone(_prev: PhoneStep, formData: FormData): Promise<PhoneStep> {
  const raw = String(formData.get("phone") ?? "");
  const phone = normaliseTzPhone(raw);
  if (!phone) return { error: tzPhoneProblem(raw) ?? "Check the phone number." };
  const customer = await prisma.customer.findFirst({
    where: { phone, deletedAt: null },
    select: { login: { select: { id: true } } },
  });
  if (!customer) return { step: "new", phone };
  return { step: customer.login ? "login" : "activate", phone };
}

const passwordRules = z
  .object({
    password: z.string().min(8, "Use at least 8 characters.").max(72, "Use at most 72 characters."),
    confirmPassword: z.string().max(72),
  })
  .refine((v) => v.password === v.confirmPassword, { message: "The two passwords do not match.", path: ["confirmPassword"] });

const BAD_CODE = "That code is not right, or it has run out. Ask our office for a new one.";

export type ActivateState = { error?: string; phone?: string };

/** Public: a customer on the books, with no login yet, opens it with the office's code. */
export async function activateAccount(_prev: ActivateState, formData: FormData): Promise<ActivateState> {
  const phone = normaliseTzPhone(String(formData.get("phone") ?? ""));
  if (!phone) return { error: "Check the phone number." };
  const email = z.string().trim().toLowerCase().email().max(200).safeParse(formData.get("email"));
  if (!email.success) return { error: "That is not an email address.", phone };
  const pw = passwordRules.safeParse({ password: formData.get("password"), confirmPassword: formData.get("confirmPassword") });
  if (!pw.success) return { error: pw.error.issues[0]?.message ?? "Check the password.", phone };
  const code = String(formData.get("code") ?? "");

  const customer = await prisma.customer.findFirst({
    where: { phone, deletedAt: null },
    select: { id: true, fullName: true, businessName: true, email: true, login: { select: { id: true } } },
  });
  if (!customer) return { error: BAD_CODE, phone };
  if (customer.login) return { error: "This number already has an account. Please sign in.", phone };

  const taken = await prisma.user.findUnique({ where: { email: email.data }, select: { id: true } });
  const emailOwner = await prisma.customer.findFirst({
    where: { email: { equals: email.data, mode: "insensitive" }, deletedAt: null, id: { not: customer.id } },
    select: { id: true },
  });
  if (taken || emailOwner) return { error: "That email is already used by another account. Use your own email.", phone };

  const passwordHash = await bcrypt.hash(pw.data.password, 12);
  const done = await prisma.$transaction(async (tx) => {
    if (!(await consumeCode(tx, customer.id, "ACTIVATE", code))) return false;
    await tx.user.create({
      data: {
        name: customer.fullName,
        email: email.data,
        phone,
        role: "CUSTOMER",
        department: null,
        passwordHash,
        customerId: customer.id,
      },
    });
    if (!customer.email) await tx.customer.update({ where: { id: customer.id }, data: { email: email.data } });
    return true;
  });
  if (!done) return { error: BAD_CODE, phone };

  await recordAudit({
    actor: null,
    action: "customer.activate",
    entity: "Customer",
    entityId: customer.id,
    summary: `${customer.businessName || customer.fullName} opened their portal login`,
  });
  await signIn("credentials", { email: email.data, password: pw.data.password, redirectTo: "/portal" });
  return {};
}

export type ResetState = { error?: string; ok?: string; phone?: string };

/** Public: a customer who forgot their password sets a new one with the office's code. */
export async function resetCustomerPassword(_prev: ResetState, formData: FormData): Promise<ResetState> {
  const phone = normaliseTzPhone(String(formData.get("phone") ?? ""));
  if (!phone) return { error: "Check the phone number." };
  const pw = passwordRules.safeParse({ password: formData.get("password"), confirmPassword: formData.get("confirmPassword") });
  if (!pw.success) return { error: pw.error.issues[0]?.message ?? "Check the password.", phone };
  const code = String(formData.get("code") ?? "");

  const customer = await prisma.customer.findFirst({
    where: { phone, deletedAt: null, login: { is: { active: true, status: "ACTIVE" } } },
    select: { id: true, fullName: true, businessName: true, login: { select: { id: true, email: true } } },
  });
  if (!customer?.login) return { error: BAD_CODE, phone };

  const passwordHash = await bcrypt.hash(pw.data.password, 12);
  const done = await prisma.$transaction(async (tx) => {
    if (!(await consumeCode(tx, customer.id, "RESET", code))) return false;
    await tx.user.update({ where: { id: customer.login!.id }, data: { passwordHash } });
    return true;
  });
  if (!done) return { error: BAD_CODE, phone };

  await recordAudit({
    actor: null,
    action: "customer.password_reset",
    entity: "Customer",
    entityId: customer.id,
    summary: `${customer.businessName || customer.fullName} set a new password with an office code`,
  });
  await signIn("credentials", { email: customer.login.email, password: pw.data.password, redirectTo: "/portal" });
  return {};
}
