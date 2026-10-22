/**
 * Store Info Service (Microservice)
 * Handles static store policy queries.
 */

const STORE_POLICIES = {
  shipping: {
    title: "Shipping Policy",
    details: [
      "Free shipping on orders above ₹999.",
      "Standard delivery takes 5-7 business days.",
      "Express delivery (2-3 days) available for ₹149 extra.",
      "We deliver across India via trusted courier partners.",
    ],
  },
  returns: {
    title: "Return & Exchange Policy",
    details: [
      "Easy 7-day return policy from the date of delivery.",
      "Products must be unused, unwashed, and in original packaging.",
      "Exchanges are free — no extra charges.",
      "Refunds are processed within 5-7 business days to the original payment method.",
    ],
  },
  payment: {
    title: "Payment Methods",
    details: [
      "We accept Credit/Debit Cards, UPI, Net Banking, and Wallets.",
      "Cash on Delivery (COD) is available for orders up to ₹5,000.",
      "Razorpay is our secure payment partner.",
      "All transactions are 100% safe and encrypted.",
    ],
  },
  contact: {
    title: "Contact Us",
    details: [
      "Email: support@trendies.com",
      "Phone: +1 (555) 123-4567",
      "Address: 123 Fashion Street, Trend City, TC 10101",
      "Hours: Mon-Sat, 10 AM - 7 PM IST",
    ],
  },
};

const getStoreInfo = (userMessage) => {
  const msg = userMessage.toLowerCase();
  let relevantPolicies = [];

  if (msg.includes("ship") || msg.includes("deliver") || msg.includes("tracking")) {
    relevantPolicies.push(STORE_POLICIES.shipping);
  }
  if (msg.includes("return") || msg.includes("refund") || msg.includes("exchange")) {
    relevantPolicies.push(STORE_POLICIES.returns);
  }
  if (msg.includes("pay") || msg.includes("upi") || msg.includes("cod") || msg.includes("card")) {
    relevantPolicies.push(STORE_POLICIES.payment);
  }
  if (msg.includes("contact") || msg.includes("email") || msg.includes("phone") || msg.includes("support")) {
    relevantPolicies.push(STORE_POLICIES.contact);
  }

  if (relevantPolicies.length === 0) {
    relevantPolicies = Object.values(STORE_POLICIES);
  }

  const message = relevantPolicies
    .map((policy) => {
      const details = policy.details.map((d) => `• ${d}`).join("\n");
      return `**${policy.title}**\n${details}`;
    })
    .join("\n\n");

  return { message };
};

module.exports = { getStoreInfo };
