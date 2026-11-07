/**
 * SMS playground (server/app/api/v1/routes/sms.py).
 * GET  /api/v1/sms/playground
 * POST /api/v1/sms/playground  { recipients, message, sender_id }
 */
import { err, ok, type Result } from "../result";
import type { ApiClient } from "./client";
import { isBoolean, isRecord, isString } from "./decode";
import type { ApiError } from "./errors";

export type SmsPlaygroundStatus = { available: boolean; senderId: string; limit: number };
export type SmsSendResult = { recipients: number; customized: boolean; detail: string };
export type SmsSendBody = { recipients: string; message: string; senderId?: string };

function statusOf(input: unknown): Result<SmsPlaygroundStatus, string> {
  if (!isRecord(input) || !isBoolean(input.available) || !isString(input.sender_id) || typeof input.limit !== "number") {
    return err("sms: unexpected status");
  }
  return ok({ available: input.available, senderId: input.sender_id, limit: input.limit });
}

function resultOf(input: unknown): Result<SmsSendResult, string> {
  if (!isRecord(input) || typeof input.recipients !== "number" || !isBoolean(input.customized) || !isString(input.detail)) {
    return err("sms: unexpected result");
  }
  return ok({ recipients: input.recipients, customized: input.customized, detail: input.detail });
}

export type SmsApi = {
  status(): Promise<Result<SmsPlaygroundStatus, ApiError>>;
  send(body: SmsSendBody): Promise<Result<SmsSendResult, ApiError>>;
};

export function createSmsApi(client: ApiClient): SmsApi {
  return {
    status: () => client.request("/api/v1/sms/playground", { decode: statusOf }),
    send: (body) => client.request("/api/v1/sms/playground", {
      method: "POST",
      body: { recipients: body.recipients, message: body.message, sender_id: body.senderId ?? "" },
      decode: resultOf,
    }),
  };
}
