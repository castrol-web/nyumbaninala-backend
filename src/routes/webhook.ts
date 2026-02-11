import express from "express";
import bodyParser from "body-parser";
import stripe from "../config/stripe";
import { Stripe } from "stripe";            
import Donation from "../models/Donation";
const router = express.Router();

const stripeWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
if (!stripeWebhookSecret) {
  throw new Error("STRIPE_WEBHOOK_SECRET is not defined in environment variables");
}
//payment confirmation route
router.post("/", bodyParser.raw({ type: "application/json" }), async (req, res) => {
  console.log("🔥 WEBHOOK HIT");
  res.sendStatus(200);
  try {
    const sig = req.headers['stripe-signature'];
    if (!sig || Array.isArray(sig)) {
      console.log("Missing or invalid signature");
      return res.status(400).send('Invalid signature header');
    }
    let event;
    try {
      event = stripe.webhooks.constructEvent(
        req.body,
        sig,
        stripeWebhookSecret
      );
    } catch (err: any) {
      console.log(`⚠️  Webhook signature verification failed.`, err.message);
      return res.sendStatus(400).send(`Webhook Error: ${err.message}`);
    }
    handleStripeEvent(event);
    res.json({ received: true });
  } catch (error) {
    res.status(500).json({ message: "Internal server error" });
  }
})



//handle stripe events
async function handleStripeEvent(event: Stripe.Event) {
  switch (event.type) {

    case 'payment_intent.succeeded': {
      const pi = event.data.object as Stripe.PaymentIntent;

      await Donation.create({
        type: 'one_time',
        amount: pi.amount / 100,
        currency: pi.currency,
        email: pi.receipt_email,
        stripePaymentIntentId: pi.id,
        status: 'paid',
        metadata: pi.metadata,
      });
      break;
    }

    case 'invoice.payment_succeeded': {
      const invoice = event.data.object as Stripe.Invoice & {
        subscription?: string;
      };


      await Donation.create({
        type: 'subscription',
        amount: invoice.amount_paid / 100,
        currency: invoice.currency,
        email: invoice.customer_email,
        stripeSubscriptionId: invoice.subscription,
        stripeInvoiceId: invoice.id,
        status: 'paid',
      });
      break;
    }

    case 'invoice.payment_failed': {
      console.warn('Subscription payment failed');
      break;
    }
  }
}