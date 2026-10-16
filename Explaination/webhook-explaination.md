# Razorpay Webhook Implementation — Deep Dive

This document explains the exact logic and code behind the Razorpay webhook feature we implemented in your `Trendies` project. This is a great resource to review before an interview to deeply understand how you solved the "Browser Close Vulnerability".

---

## 1. The Core Problem We Solved
When a user pays via Razorpay, they are on your website. If their internet drops or they close the tab the exact millisecond the payment succeeds, your React frontend dies. It never gets a chance to call `/api/order/verifyRazorpay`. 
- **Result without Webhooks:** User is charged, but your database says `payment: false`.
- **Result with Webhooks:** Razorpay's servers send a hidden background request directly to your Node.js backend to confirm the payment, bypassing the browser entirely.

---

## 2. The Webhook Controller (`webhookController.js`)

This is the brain of the operation. Let's break down the `razorpayWebhook` function step-by-step.

### Step A: Verify the Signature (Security)
Anyone on the internet can send a POST request to your webhook URL. To prove the request genuinely came from Razorpay, we use HMAC-SHA256 signature verification.

```javascript
const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
const signature = req.headers["x-razorpay-signature"]; // Sent by Razorpay

// We create our own signature using the secret password and the request body
const expectedSignature = crypto
    .createHmac("sha256", webhookSecret)
    .update(JSON.stringify(req.body))
    .digest("hex");

// If they don't match, an attacker is trying to fake a payment!
if (signature !== expectedSignature) {
    return res.status(400).json({ message: "Invalid signature" });
}
```
> **Interview Tip:** Mentioning `crypto.createHmac` and "signature verification" proves you understand backend API security.

### Step B: Extract the Magic Link (`receiptId`)
How does the webhook know *which* user and *which* items were paid for?
When your backend initially creates the Razorpay order (in `placeOrderRazorpay`), you pass your MongoDB Order `_id` as the `receipt`. Razorpay sends this exact string back to us in the webhook.

```javascript
const event = req.body.event; // e.g., 'payment.captured'
const payload = req.body.payload;

// Extract our MongoDB Order _id from Razorpay's payload
const actualReceiptId = payload.order?.entity?.receipt;
```
Because the MongoDB Order document already contains the `userId`, the cart `items`, and the `amount`, the webhook doesn't need to know anything else. It just needs that `_id` to find the order.

### Step C: Handle Successful Payments (`payment.captured`)
If the money is successfully captured, we need to mark the order as paid and empty the user's cart.

```javascript
if (event === "payment.captured") {
    const order = await Order.findById(actualReceiptId);
    
    // Idempotency Check: Only update if it's NOT already paid
    if (order && !order.payment) {
        
        // 1. Mark order as paid
        await Order.findByIdAndUpdate(actualReceiptId, { payment: true });
        
        // 2. Clear the user's cart
        await User.findByIdAndUpdate(order.userId, { cartData: {} });
        
        console.log(`Webhook: Order ${actualReceiptId} marked as paid`);
    }
} 
```
> **Idempotency:** Notice `if (order && !order.payment)`. This ensures that if the browser handler (`/verifyRazorpay`) and the Webhook both fire at the exact same time, the order is only processed once.

### Step D: Handle Failed Payments (`payment.failed`)
If the user's credit card is declined by the bank, Razorpay sends a `payment.failed` event.

```javascript
else if (event === "payment.failed") {
    const order = await Order.findById(actualReceiptId);
    
    if (order && !order.payment) {
        // The items were reserved when they clicked "Place Order".
        // Since payment failed, we MUST release the stock back to inventory.
        if (order.items && order.items.length > 0) {
            await releaseStock(order.items);
            console.log(`Webhook: Stock released for failed order ${actualReceiptId}`);
        }
    }
}
```

### Step E: The Golden Rule of Webhooks (Always Return 200)
At the very end of the controller, and inside the `catch` block, you must return HTTP 200 OK.

```javascript
// Always respond with 200 OK so Razorpay knows we received it
res.status(200).json({ received: true });
```
If your server crashes or you return a `500 Error`, Razorpay thinks the delivery failed. It will retry sending the exact same webhook every few minutes for the next 24 hours, spamming your server. Always return 200 to acknowledge receipt.

---

## 3. The Route Setup (`webhookRoute.js` & `app.js`)

In `webhookRoute.js`:
```javascript
const express = require("express");
const { razorpayWebhook } = require("../controller/webhookController");
const webhookRoute = express.Router();

webhookRoute.post("/razorpay", razorpayWebhook);
module.exports = webhookRoute;
```
> **Crucial Detail:** There is NO `isAuth` or `adminAuth` middleware here. Razorpay's servers do not have your user's JWT cookies. They cannot "log in" to your app. The security is handled entirely by the HMAC signature verification in the controller.

In `app.js`:
```javascript
const webhookRoute = require("./routes/webhookRoute");
app.use("/api/webhooks", webhookRoute);
```

---

## 4. Summary of the Flow
1. **User clicks Place Order:** Stock is locked, `Order` created in Mongo (`payment: false`). Razorpay order created with Mongo `_id` as the `receipt`.
2. **User Pays:** Razorpay processes payment.
3. **Browser Dies:** User closes the tab instantly.
4. **Webhook Fires:** 2 seconds later, Razorpay sends `payment.captured` POST request to `/api/webhooks/razorpay`.
5. **Signature Verified:** Backend proves it's Razorpay using the `.env` secret.
6. **Order Found:** Backend extracts the `receipt` string, finds the Order in MongoDB.
7. **Database Updated:** Backend flips `payment: true` and clears the user's cart.
8. **Result:** Data consistency is maintained seamlessly!
