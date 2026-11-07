/** Load Paddle.js where checkout runs. The overlay never grants access. */

import type { BillingSnapshot } from "./types";

type CheckoutEvent = { name?: string };
type PaddleCheckout = {
  open: (options: { transactionId: string }) => void;
};
type PaddleGlobal = {
  Environment: { set: (env: "sandbox" | "production") => void };
  Initialize: (options: { token: string; eventCallback?: (event: CheckoutEvent) => void }) => void;
  Checkout: PaddleCheckout;
};

declare global {
  interface Window {
    Paddle?: PaddleGlobal;
  }
}

const SCRIPT = "https://cdn.paddle.com/paddle/v2/paddle.js";
let loading: Promise<PaddleGlobal> | null = null;
let initialized = false;
let completed: (() => void) | undefined;

export function paddleEnvironment(): "sandbox" | "production" {
  return process.env.NEXT_PUBLIC_PADDLE_ENVIRONMENT === "production" ? "production" : "sandbox";
}

export function paddleClientToken(): string {
  return (process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN ?? "").trim();
}

function loadScript(): Promise<PaddleGlobal> {
  if (typeof window === "undefined") return Promise.reject(new Error("Paddle.js runs in the browser."));
  if (window.Paddle) return Promise.resolve(window.Paddle);
  if (loading) return loading;
  loading = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = SCRIPT;
    script.async = true;
    script.onload = () => (window.Paddle ? resolve(window.Paddle) : reject(new Error("Paddle.js did not start.")));
    script.onerror = () => { loading = null; script.remove(); reject(new Error("Paddle.js failed to load. Try again.")); };
    document.head.appendChild(script);
  });
  return loading;
}

/** Open a server-created transaction. `checkout.completed` only means Paddle showed success. */
export async function openCheckout(transactionId: string, onCompleted: () => void): Promise<void> {
  const token = paddleClientToken();
  if (!token) throw new Error("The Paddle client token isn't set.");
  completed = onCompleted;
  const paddle = await loadScript();
  if (!initialized) {
    paddle.Environment.set(paddleEnvironment());
    paddle.Initialize({
      token,
      eventCallback: (event) => {
        if (event.name === "checkout.completed") completed?.();
      },
    });
    initialized = true;
  }
  paddle.Checkout.open({ transactionId });
}

export function confirmingCopy(snapshot: BillingSnapshot | null): string | null {
  if (!snapshot?.pendingCheckout) return null;
  if (snapshot.pendingCheckout.status === "ambiguous") return "A checkout may already exist. Refresh in a moment.";
  if (snapshot.access.entitlement === "paid") return null;
  return "Confirming payment";
}
