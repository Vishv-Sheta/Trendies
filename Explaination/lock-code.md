# Comprehensive Code Walkthrough: Trendies Inventory Locking

This document provides a line-by-line explanation of exactly how the atomic database locking mechanism is implemented in your codebase to prevent overselling.

---

## 1. The Core Lock Engine (`backend/services/stockService.js`)

This service acts as the gatekeeper for your database. It uses MongoDB's built-in atomic operations to reserve stock safely.

### The `reserveStock` Function
```javascript
const reserveStock = async (items) => {
    const reservedItems = [];
    const failedItems = [];

    // We loop through every item the user is trying to buy in their cart
    for (const item of items) {
        const qty = item.quantity || 1;

        // THE ATOMIC LOCK: We hit the database here.
        const product = await Product.findOneAndUpdate(
            {
                // 1. Find the exact product by ID
                _id: item._id,
                // 2. The Condition (The Lock): Only find it IF the stock for this specific size is greater than or equal to the quantity requested.
                [`sizes.${item.size}`]: { $gte: qty } 
            },
            {
                // 3. The Action: If it found the product (meaning stock is sufficient), instantly deduct the requested quantity.
                $inc: { [`sizes.${item.size}`]: -qty } 
            },
            { new: true } // Return the updated product document
        );

        if (!product) {
            // LOCK FAILED: findOneAndUpdate returned null.
            // This means EITHER the product doesn't exist, OR the condition ($gte) failed because someone else bought the last one a millisecond before.
            const failedProduct = await Product.findById(item._id).lean();
            failedItems.push({
                ...item,
                name: failedProduct?.name || "Unknown product",
                availableQty: failedProduct?.sizes?.get?.(item.size) ?? failedProduct?.sizes?.[item.size] ?? 0
            });
        } else {
            // LOCK SUCCEEDED: The stock was successfully reduced.
            reservedItems.push(item);
        }
    }

    // Return the result of the reservation attempt to the controller
    return { 
        success: reservedItems.length > 0, // True if at least one item was reserved
        reservedItems,
        failedItems 
    };
};
```

---

## 2. Triggering the Lock During Checkout (`backend/controller/orderController.js`)

We need to call our `reserveStock` gatekeeper *before* we finalize any orders or open payment gateways.

### Example: Cash on Delivery (`PlacedOrder`)
```javascript
const PlacedOrder = async (req, res) => {
    try {
        const { items, address } = req.body;
        let { amount } = req.body;
        const userId = req.userId;

        // 1. FIRE THE LOCK: Attempt to reserve stock for all items in the cart
        const stockResult = await reserveStock(items);
        
        // 2. COMPLETE FAILURE: If it couldn't reserve anything, reject the order.
        if (!stockResult.success) {
            return res.status(409).json({
                message: "All items in your order are out of stock.",
                failedItems: stockResult.failedItems
            });
        }

        // 3. PARTIAL SUCCESS: Some items were in stock, some were sold out.
        // We recalculate the user's total bill to subtract the price of the sold-out items.
        if (stockResult.failedItems.length > 0) {
            let failedAmount = 0;
            for (const item of stockResult.failedItems) {
                failedAmount += (item.price * item.quantity);
            }
            amount -= failedAmount;
        }

        // 4. FINALIZE ORDER: We only save the `reservedItems` to the new order. 
        // The `failedItems` are ignored.
        const orderData = {
            items: stockResult.reservedItems,
            amount,
            userId,
            address,
            paymentMethod: 'cod',
            payment: false,
            date: Date.now()
        }

        const newOrder = new Order(orderData);
        await newOrder.save();
        
        // 5. NOTIFY USER: Send back a message letting them know if any items were removed due to stock.
        let message = 'Order Placed';
        if (stockResult.failedItems.length > 0) {
            const failedNames = stockResult.failedItems.map(i => `${i.name} (Size: ${i.size})`).join(', ');
            message = `Order placed. Note: ${failedNames} were removed as they are out of stock.`;
        }

        return res.status(201).json({ message, failedItems: stockResult.failedItems })
    } 
    // ... catch blocks
}
```

---

## 3. The Safety Net: Rollbacks (`backend/services/stockService.js` & `orderController.js`)

If a user goes to Razorpay (their stock is reserved/locked), but their card declines, we must give that stock back to the public pool so someone else can buy it.

### The `releaseStock` Function
```javascript
const releaseStock = async (items) => {
    // Loop through the items that were previously reserved
    for (const item of items) {
        // Unconditionally increment the stock back up by the quantity they had reserved
        await Product.findByIdAndUpdate(
            item._id,
            { $inc: { [`sizes.${item.size}`]: item.quantity } }
        );
    }
};
```

### Triggering the Rollback on Payment Failure
```javascript
// inside placeOrderRazorpay (If Razorpay API fails to generate an order)
await razorpayInstance.orders.create(options, (error, order) => {
    if (error) {
        // ROLLBACK: Release the reserved stock immediately!
        releaseStock(stockResult.reservedItems);
        return res.status(500).json(error);
    }
    // ...
})

// inside verifyRazorpay (If the webhook returns a failed payment status)
const verifyRazorpay = async (req, res) => {
    // ...
    if (orderInfo.status === 'paid') {
        // Success logic...
    } else {
        // ROLLBACK: Payment failed — release the reserved stock
        const order = await Order.findById(orderInfo.receipt);
        if (order && order.items) {
            await releaseStock(order.items); // Stock goes back to 1
        }
        res.json({message:'Payment Failed'})
    }
}
```

This 3-step architecture (Reserve -> Evaluate -> Rollback on Fail) is the golden standard for ensuring absolute inventory accuracy in modern e-commerce architectures.
