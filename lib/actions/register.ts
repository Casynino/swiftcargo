"use server";

import bcrypt from "bcryptjs";
import { z } from "zod";

import { signIn } from "@/auth";
import { recordAudit } from "@/lib/audit";
import { nextCustomerCode, shippingMarkFor } from "@/lib/ids";
import { notifyStaff, staffInDepartment } from "@/lib/notify";
import { normaliseTzPhone, tzPhoneProblem } from "@/lib/phone";
import { prisma } from "@/lib/prisma";
import { formMessage } from "@/lib/safe-error";

export type ActionState = {
  error?: string;
  ok?: string;
  /* What was typed, handed back with an error so the form is not emptied —
     never the passwords. */
  values?: { fullName?: string; businessName?: string; phone?: string; email?: string };
};

const schema = z
  .object({
    fullName: z.string().trim().min(2, "Your full name, please.").max(120),
    businessName: z.string().trim().max(160).optional(),
    phone: z.string().trim().min(6, "A phone number is required.").max(30),
    email: z.string().trim().toLowerCase().email("That is not an email address.").max(200),
    /* bcrypt reads only the first 72 bytes; a longer password is not stronger,
       only slower to hash. */
    password: z.string().min(8, "Use at least 8 characters.").max(72, "Use at most 72 characters."),
    confirmPassword: z.string().max(72),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "The two passwords do not match.",
    path: ["confirmPassword"],
  });

/**
 * A customer signs themselves up.
 *
 * Creates the Customer and the login together, in one transaction, because a
 * login with no customer behind it is an account whose every query has no WHERE
 * clause — and a customer with no login is somebody who cannot get in.
 *
 * The shipping mark is generated here. It is the whole reason to register: it
 * is what the customer sends to their supplier, and without it a box arriving
 * in Guangzhou belongs to nobody.
 */
export async function registerCustomer(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const parsed = schema.safeParse({
    fullName: formData.get("fullName"),
    businessName: formData.get("businessName") || undefined,
    phone: formData.get("phone"),
    email: formData.get("email"),
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  });

  const values = {
    fullName: String(formData.get("fullName") ?? ""),
    businessName: String(formData.get("businessName") ?? ""),
    phone: String(formData.get("phone") ?? ""),
    email: String(formData.get("email") ?? ""),
  };
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the form.", values };
  }
  const data = parsed.data;
  const phone = normaliseTzPhone(data.phone);
  if (!phone) return { error: tzPhoneProblem(data.phone) ?? "Check the phone number.", values };

  const takenEmail = await prisma.user.findUnique({
    where: { email: data.email },
    select: { id: true },
  });
  if (takenEmail) {
    return { error: "There is already an account with that email. Try signing in.", values };
  }

  const passwordHash = await bcrypt.hash(data.password, 12);

  try {
    await prisma.$transaction(async (tx) => {
      /*
        AN EXISTING CUSTOMER MIGHT ALREADY BE ON THE SYSTEM.

        Somebody who has shipped with us before was registered at the counter
        and has a code, a mark and a history. Signing up should attach a login to
        THAT record, not mint a second one — otherwise their old cargo is
        invisible to them and the warehouse ends up with two marks for one
        person.
      */
      const existing = await tx.customer.findFirst({
        where: { phone, deletedAt: null },
        include: { login: { select: { id: true } } },
      });

      if (existing?.login) {
        throw new Error(
          "That phone number already has an account. Try signing in, or use another number."
        );
      }

      /*
        A PHONE NUMBER IS NOT PROOF OF WHO YOU ARE.

        Attaching a login to the existing record hands whoever typed the number
        that customer's cargo, bills, photographs and the right to ask for their
        goods to be delivered. A number is written on every box and every
        delivery note, so it is the easiest thing in the building to learn. The
        record is attached only when the email typed here is the one the office
        already holds for that customer; otherwise the office opens the account,
        having spoken to the person.
      */
      if (
        existing &&
        (!existing.email || existing.email.trim().toLowerCase() !== data.email)
      ) {
        throw new Error(
          "That phone number is already on our books. Contact our office and we will open your account for you."
        );
      }

      /* An email names one customer, as a number does. */
      const emailOwner = await tx.customer.findFirst({
        where: {
          email: { equals: data.email, mode: "insensitive" },
          deletedAt: null,
          ...(existing ? { id: { not: existing.id } } : {}),
        },
        select: { id: true },
      });
      if (emailOwner) {
        throw new Error(
          "That email is already on our books for another customer. Use your own email, or contact our office."
        );
      }

      const customer =
        existing ??
        (await (async () => {
          const code = await nextCustomerCode(tx);
          return tx.customer.create({
            data: {
              code,
              fullName: data.fullName,
              businessName: data.businessName || null,
              phone,
              email: data.email,
              country: "Tanzania",
              shippingMark: await shippingMarkFor(tx, data.fullName, code),
            },
          });
        })());

      await tx.user.create({
        data: {
          name: data.fullName,
          email: data.email,
          phone,
          role: "CUSTOMER",
          department: null,
          passwordHash,
          customerId: customer.id,
        },
      });

      await notifyStaff(
        await staffInDepartment("CUSTOMER_SUPPORT", tx),
        {
          kind: "customer.registered",
          title: `${data.fullName} registered`,
          body: `${phone} · mark ${customer.shippingMark}`,
          href: `/app/customers/${customer.id}`,
        },
        tx
      );
    });
  } catch (error) {
    return {
      error: formMessage(error, "We could not create that account."),
      values,
    };
  }

  await recordAudit({
    actor: null,
    action: "customer.register",
    entity: "Customer",
    summary: `${data.fullName} registered from the website`,
  });

  /* Straight in — the next thing they need is their shipping mark, and it is
     on the portal's first screen. */
  await signIn("credentials", {
    email: data.email,
    password: data.password,
    redirectTo: "/portal",
  });

  return {};
}
