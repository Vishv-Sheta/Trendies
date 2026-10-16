# Razorpay Webhooks — Concept & Data Flow

---

## What Are Webhooks?

### Simple Explanation
A **webhook** is a way for one server to automatically notify another server when something happens — without anyone asking for it.

Think of it like this:
- **Polling (Without Webhooks):** You keep calling your friend every 5 minutes asking, *"Has my package arrived yet?"* — wasteful and annoying.
- **Webhook:** Your friend calls *you* the moment the package arrives — efficient and instant.

### Technical Definition
A webhook is an **HTTP callback** — an HTTP POST request that is sent automatically from one server to another when a specific event occurs. The receiving server exposes a URL endpoint, and the sending server "pushes" event data to it in real-time.

### How It Works (Step by Step)

```
┌──────────┐         ┌──────────────┐         ┌──────────────┐
│  User's  │  pays   │   Razorpay   │  POST   │  Your Node   │
│  Browser │ ──────► │   Servers    │ ──────► │  Backend     │
└──────────┘         └──────────────┘         └──────────────┘
      │                     │                        │
      │  (browser may       │  Webhook fires         │  Updates DB:
      │   close here!)      │  automatically         │  payment = true
      │                     │  to YOUR server         │
```

1. **You register a webhook URL** with Razorpay (e.g., `https://your-backend.com/api/webhooks/razorpay`).
2. **An event happens** — a payment is completed, failed, or refunded.
3. **Razorpay sends an HTTP POST request** to your registered URL with the event details as JSON.
4. **Your backend processes the event** — marks the order as paid, releases stock on failure, etc.

### Key Properties of Webhooks
| Property | Detail |
|---|---|
| **Direction** | Server → Server (bypasses the browser entirely) |
| **Trigger** | Event-driven (fires only when something happens) |
| **Method** | Always HTTP POST |
| **Security** | Verified using a shared secret + HMAC signature |
| **Reliability** | Razorpay retries failed deliveries automatically |

---

## Why Your Project Needs Webhooks

### The Current Vulnerability

Your current Razorpay payment flow relies entirely on the **browser** to confirm payment:

```
User pays → Razorpay tells BROWSER → Browser calls YOUR backend → DB updated
```

**What can go wrong:**
- ❌ User's phone battery dies after paying
- ❌ User's internet disconnects mid-redirect  
- ❌ User accidentally closes the tab
- ❌ Browser crashes after payment completes

**Result:** Money is deducted from user's account, but your database still shows `payment: false`. The reserved stock might get released. The user gets charged but receives no order confirmation.

### The Fix: Dual Verification

With webhooks, you get **two chances** to confirm payment:

```
Path 1 (Browser):  User pays → Browser handler → /verifyRazorpay → DB updated ✅
Path 2 (Webhook):  User pays → Razorpay server → /webhooks/razorpay → DB updated ✅
```

Even if Path 1 fails (browser closed), Path 2 still fires because it's server-to-server.

---

## The Big Question: How Does the Backend Know Which Order, Which User, Which Items?

This is the key insight — **the backend ALREADY knows everything. The stock is ALREADY reduced. The webhook only needs to flip one boolean: `payment: false → payment: true`.**

Here's why:

### Your Current Flow (What Already Happens BEFORE Payment)

When a user clicks "Place Order" with Razorpay, your `placeOrderRazorpay` controller does ALL of this **before** Razorpay even opens:

```
Step 1: reserveStock(items)        → Stock is ALREADY deducted from inventory
Step 2: new Order({...}).save()    → Order is ALREADY saved in MongoDB with:
                                      - userId (which user)
                                      - items (what they ordered, with sizes & quantities)
                                      - amount (total price)
                                      - address (delivery info)
                                      - payment: false  ← this is the only thing left to update
Step 3: razorpayInstance.orders.create({
            amount: amount * 100,
            currency: 'INR',
            receipt: newOrder._id.toString()   ← THIS IS THE LINK 🔑
        })
```

**The `receipt` field is the magic link.** When you create the Razorpay order, you pass your MongoDB Order `_id` as the `receipt`. Razorpay stores this and sends it back in every webhook event.

### What Razorpay Sends to Your Webhook

When a `payment.captured` event fires, Razorpay sends a POST request to your webhook URL with a JSON body that looks like this:

```json
{
  "event": "payment.captured",
  "payload": {
    "payment": {
      "entity": {
        "id": "pay_ABC123XYZ",
        "amount": 50000,
        "currency": "INR",
        "status": "captured",
        "order_id": "order_RAZ456DEF",
        "method": "upi",
        "email": "user@gmail.com",
        "contact": "+919876543210"
      }
    },
    "order": {
      "entity": {
        "id": "order_RAZ456DEF",
        "amount": 50000,
        "receipt": "6839abc123def456ghi789"    ← YOUR MongoDB Order _id! 🔑
      }
    }
  }
}
```

### The Connection Chain

```
Razorpay webhook body
    └── payload.order.entity.receipt = "6839abc123def456ghi789"
                                            │
                                            ▼
                                    MongoDB Orders Collection
                                    ┌──────────────────────────────┐
                                    │ _id: "6839abc123def456ghi789" │
                                    │ userId: "user_abc123"         │  ← knows WHICH user
                                    │ items: [                      │  ← knows WHICH items
                                    │   { _id: "prod1", size: "M",  │
                                    │     quantity: 2 },             │
                                    │   { _id: "prod2", size: "L",  │
                                    │     quantity: 1 }              │
                                    │ ]                              │
                                    │ amount: 500                    │
                                    │ payment: false ← FLIP TO true │  ← only thing webhook does
                                    │ paymentMethod: "Razorpay"      │
                                    └──────────────────────────────┘
```

### So the Webhook Logic is Just:

1. **Verify** the request is genuinely from Razorpay (using HMAC signature check)
2. **Extract** `receipt` from the webhook body → this is your MongoDB Order `_id`
3. **Find** the order in your database using that `_id`
4. **Check** if `payment` is still `false` (to avoid double-processing)
5. **Update** `payment: true`
6. **Clear** the user's cart (`cartData: {}`)
7. **Respond** with HTTP 200 to Razorpay

**That's it.** No stock reduction needed because `reserveStock()` already ran when the order was created. No need to know the cart items because they're already saved in the order document. The `receipt` field is the single thread that connects everything.

---

## What About Payment Failure?

If the payment fails, Razorpay sends a `payment.failed` event. Your webhook can handle this too:

1. **Extract** the `receipt` (your Order `_id`) from the failed event
2. **Find** the order in MongoDB
3. **Call** `releaseStock(order.items)` to return the reserved stock back to inventory
4. **Optionally** delete the failed order or mark it as "Payment Failed"

This is the same thing your current `verifyRazorpay` does in the `else` branch — but now it happens even if the browser is closed.

---

## Security: How Do You Know It's Really Razorpay?

Anyone on the internet could send a POST request to `/api/webhooks/razorpay` and try to mark orders as paid. This is why **signature verification** is critical.

### How It Works:

1. When you register the webhook in Razorpay Dashboard, you set a **Webhook Secret** (a random string).
2. Razorpay uses this secret to create a **HMAC-SHA256 signature** of the entire request body.
3. Razorpay sends this signature in the request header: `x-razorpay-signature`.
4. Your backend takes the request body, creates its OWN HMAC-SHA256 using the same secret, and **compares** the two signatures.

```
Razorpay's signature  =  HMAC-SHA256(request body, webhook_secret)
Your signature         =  HMAC-SHA256(request body, webhook_secret)

If they match → Request is genuine ✅
If they don't → Someone is faking it, reject ❌
```

This works because only you and Razorpay know the webhook secret. An attacker can send a fake body, but they can't generate the correct signature without the secret.

---

## Important Rules for Webhook Endpoints

| Rule | Why |
|---|---|
| **No auth middleware (no JWT, no cookies)** | Razorpay's server can't log into your app. Security is via HMAC signature instead. |
| **Always return HTTP 200** | If you return 4xx/5xx, Razorpay thinks delivery failed and retries for hours. Even on errors, return 200. |
| **Make it idempotent** | The same webhook might fire twice. Check `if (!order.payment)` before updating to prevent double-processing. |
| **Use HTTPS in production** | Razorpay requires your webhook URL to be HTTPS. Your Render deployment already has this. |
| **Keep the webhook secret in `.env`** | Never hardcode secrets. Store in `RAZORPAY_WEBHOOK_SECRET` env variable. |

---

## Summary: Before vs After

| Aspect | Before (Current) | After (With Webhooks) |
|---|---|---|
| Payment confirmation path | Browser only | Browser + Server-to-Server |
| Browser crash during payment | Order stays unpaid ❌ | Webhook confirms payment ✅ |
| Security | Razorpay SDK fetch | Razorpay SDK fetch + HMAC signature |
| Stock release on failure | Only if browser calls verify | Webhook also handles failures |
| Production readiness | Basic | Industry standard |
