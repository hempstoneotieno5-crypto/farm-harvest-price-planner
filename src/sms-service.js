import crypto from "node:crypto";
import { readCollection, writeCollection } from "./storage.js";

export async function sendSmsAlert({ message, phoneNumber, config }) {
  if (!phoneNumber) {
    return { delivered: false, mode: "skipped" };
  }

  if (!config.africasTalkingApiKey || !config.africasTalkingUsername) {
    const outbox = readCollection("sms-outbox.json");
    outbox.unshift({
      id: crypto.randomUUID(),
      phoneNumber,
      message,
      createdAt: new Date().toISOString(),
      mode: "preview"
    });
    writeCollection("sms-outbox.json", outbox);
    return { delivered: false, mode: "preview" };
  }

  try {
    const { default: africastalking } = await import("africastalking");
    const client = africastalking({
      apiKey: config.africasTalkingApiKey,
      username: config.africasTalkingUsername
    });
    await client.SMS.send({
      to: [phoneNumber],
      message,
      from: config.africasTalkingSenderId || undefined,
      enqueue: true
    });
    return { delivered: true, mode: "africas-talking" };
  } catch {
    const outbox = readCollection("sms-outbox.json");
    outbox.unshift({
      id: crypto.randomUUID(),
      phoneNumber,
      message,
      createdAt: new Date().toISOString(),
      mode: "fallback"
    });
    writeCollection("sms-outbox.json", outbox);
    return { delivered: false, mode: "fallback" };
  }
}
