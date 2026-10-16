# Webhooks Code Understanding: Theory to Code Mapping

This document provides a line-by-line mapping of how the theoretical webhook concepts described in `webhooks-logic.md` are practically implemented in the codebase (specifically inside `backend/controller/webhookController.js`).

---

## 1. Security: HMAC Signature Verification

In the theory, we discussed the "Digital Wax Seal" to prove the webhook actually came from Razorpay and not a hacker.

### The Implementation (Lines 16-37)
```javascript
const signature = req.headers["x-razorpay-signature"]; // 1. Get the seal

// 2. Create our own seal using our secret password
const expectedSignature = crypto
    .createHmac("sha256", webhookSecret)
    .update(JSON.stringify(req.body))
    .digest("hex");

// 3. Compare the two seals
if (signature !== expectedSignature) {
    return res.status(400).json({ message: "Invalid signature" });
}
```
* **Explanation:** We use Node's native `crypto` library to hash the entire incoming `req.body` using our `RAZORPAY_WEBHOOK_SECRET`. If our locally generated hash matches the `x-razorpay-signature` sent in the headers, we know the request is 100% authentic and hasn't been tampered with.

---

## 2. Bridging the Gap: Finding the Database Order

In the theory, we learned that Razorpay's `payment.captured` event doesn't tell us our MongoDB `_id` directly. We have to fetch the parent Razorpay Order to find our `receipt`.

### The Implementation (Lines 43-64)
```javascript
// 1. Grab the Razorpay Order ID from the payment payload
const razorpayOrderId = payload.payment?.entity?.order_id;

// 2. Ask Razorpay for the full order details
const razorpayOrder = await razorpayInstance.orders.fetch(razorpayOrderId);

// 3. Extract our MongoDB _id (which we saved in the "receipt" field during checkout)
const mongoOrderId = razorpayOrder.receipt; 
```
* **Explanation:** This is a crucial "bridge". We use the `razorpay` SDK instance (initialized at the top of the file) to make a quick API call back to Razorpay. We fetch the full order details, which contains the `receipt` field where we originally hid our MongoDB `_id` when the user clicked "Place Order".

---

## 3. Handling Success (`payment.captured`)

When the payment actually succeeds, we need to mark the order as paid and empty the user's cart. We also need to be **idempotent** (ignore duplicates).

### The Implementation (Lines 69-82)
```javascript
if (event === "payment.captured") {
    const order = await Order.findById(mongoOrderId);
    
    // Idempotency Check: Only process if it hasn't been paid yet
    if (order && !order.payment) {
        // 1. Mark order as paid
        await Order.findByIdAndUpdate(mongoOrderId, { payment: true });
        // 2. Empty the cart
        await User.findByIdAndUpdate(order.userId, { cartData: {} });
    } 
    else if (order && order.payment) {
        // Duplicate Webhook detected — ignore it silently
        console.log(`Webhook: Order was already marked as paid.`);
    }
}
```
* **Explanation:** By checking `!order.payment`, we prevent a scenario where a duplicate webhook accidentally triggers the database updates again. If it is already `true`, we do nothing.

---

## 4. Handling Failure (`payment.failed`)

If the user's card declines, we must release the inventory back to the store so we don't end up with "Dead Stock".

### The Implementation (Lines 83-96)
```javascript
else if (event === "payment.failed") {
    const order = await Order.findById(mongoOrderId);
    
    if (order && !order.payment) {
        // 1. Release stock back to inventory
        if (order.items && order.items.length > 0) {
            await releaseStock(order.items);
        }

        // 2. Update status for the user UI
        await Order.findByIdAndUpdate(mongoOrderId, { status: "Payment Failed" });
    }
}
```
* **Explanation:** We import `releaseStock` from `stockService.js`. By passing the failed `order.items` to it, the backend safely returns those exact items and sizes back into the available pool for other customers to buy. We also update the status so the user can see "Payment Failed" on their "My Orders" page.

---

## 5. The Fast `200 OK` (Preventing Webhook Spam)

As discussed earlier, Razorpay will DDoS our server with retries if we don't acknowledge receipt.

### The Implementation (Lines 98-105)
```javascript
        // At the very end of the success flow...
        res.status(200).json({ received: true });

    } catch (error) {
        console.error("Webhook processing error:", error);
        
        // EVEN in the catch block (if our DB crashes), we return 200
        res.status(200).json({ received: true });
    }
```
* **Explanation:** Notice how `res.status(200)` is placed both at the bottom of the `try` block AND inside the `catch` block. This guarantees that no matter what internal nightmare our backend is having, Razorpay gets a fast `200 OK` and instantly stops sending retries.
