import dotenv from "dotenv";
dotenv.config();
import express from "express";
const router = express.Router();
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import stripe from "../config/stripe";
import { Stripe } from "stripe";
import Projects from "../models/Projects";
import { transport } from "../util/nodemailer";

const stripeWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
if (!stripeWebhookSecret) {
  throw new Error("STRIPE_SECRET_KEY is not defined in environment variables");
}


//s3 credentials
const accessKey = process.env.AWS_ACCESS_KEY_ID;
const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
const region = process.env.AWS_REGION;
const bucketName = process.env.AWS_BUCKET_NAME;

if (!accessKey || !secretAccessKey || !region || !bucketName) {
  throw new Error("all S3 credentials are required")
}

const s3 = new S3Client({
  credentials: {
    accessKeyId: accessKey,
    secretAccessKey: secretAccessKey
  }, region
})

//fetching all the projects
router.get("/projects", async (req, res) => {
  try {
    const projects = await Projects.find();
    if (!projects || projects.length === 0) {
      return res.status(404).json({ message: "Oops! No projects found" });
    }

    // Generate signed URLs for each project
    const projectsWithUrls = await Promise.all(
      projects.map(async (project) => {
        let signedUrl = "";
        if (project.projectImage) {
          try {
            signedUrl = await generateSignedUrl(project.projectImage);
          } catch (err) {
            console.error("Failed to generate signed URL for project:", project._id, err);
          }
        }
        return {
          ...project.toObject(),
          projectImage: signedUrl, // replace key with signed URL
        };
      })
    );

    res.status(200).json(projectsWithUrls);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal server error" });
  }
});



//payment intent creation route
router.post("/payments/create-intent", async (req, res) => {
  try {
    const { amount, name, email } = req.body;

    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount * 100),
      currency: 'eur',
      payment_method_types: ['card'],
      metadata: { donorName: name },
    });

    res.status(200).json({ clientSecret: paymentIntent.client_secret, type: 'payment' });
  } catch (err) {
    console.error('Payment intent error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

//subscription setup intent creation route
router.post("/payments/create-subscription-setup", async (req, res) => {
  try {
    const { name, email } = req.body;

    const customer = await stripe.customers.create({ name, email });

    const setupIntent = await stripe.setupIntents.create({
      customer: customer.id,
      payment_method_types: ['card'],
    });

    res.status(200).json({
      clientSecret: setupIntent.client_secret,
      customerId: customer.id
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Internal server error" });
  }
});


//activate subscriptions
router.post("/payments/activate-subscription", async (req, res) => {
  try {
    const { customerId, paymentMethodId, amount } = req.body;

    const price = await stripe.prices.create({
      unit_amount: Math.round(amount * 100),
      currency: 'eur',
      recurring: { interval: 'month' },
      product_data: { name: 'Monthly Donation' },
    });

    const subscription = await stripe.subscriptions.create({
      customer: customerId,
      items: [{ price: price.id }],
      default_payment_method: paymentMethodId,
      expand: ['latest_invoice.payment_intent'],
    });

    res.status(200).json({
      subscriptionId: subscription.id,
      status: subscription.status
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Internal server error" });
  }
});

//contact us 
router.post("/contact", async (req, res) => {
  const { name, email, subject, message } = req.body;

  if (!name || !email || !subject || !message) {
    return res.status(400).json({ message: "All fields are required." });
  }

  try {
    await transport.sendMail({
      from: `"${name}" <${email}>`,
      to: "castrolmkude@gmail.com",//nyumbaninala email 
      subject: `[Contact Form] ${subject}`,
      html: `
        <p><strong>Name:</strong> ${name}</p>
        <p><strong>Email:</strong> ${email}</p>
        <p><strong>Message:</strong></p>
        <p>${message}</p>
      `,
    });

    res.status(201).json({ message: "Message sent successfully!" });
  } catch (err) {
    console.error("Failed to send contact form email", err);
    res.status(500).json({ message: "Failed to send message." });
  }
});



//subscription creation route
router.post("/payments/create-subscription", async (req, res) => {
  try {
    const { amount, name, email } = req.body;

    // Create customer
    const customer = await stripe.customers.create({ name, email });

    // Create price
    const price = await stripe.prices.create({
      unit_amount: Math.round(amount * 100),
      currency: 'eur',
      recurring: { interval: 'month' },
      product_data: { name: 'Monthly Donation' },
    });

    // Create subscription
    const subscription = await stripe.subscriptions.create({
      customer: customer.id,
      items: [{ price: price.id }],
      payment_behavior: 'default_incomplete',
      expand: ['latest_invoice.payment_intent'],
    });

    let clientSecret: string;
    let type: 'payment' | 'setup' = 'payment';

    const latestInvoice = subscription.latest_invoice as any;
    const paymentIntent = latestInvoice?.payment_intent as Stripe.PaymentIntent | null;

    if (paymentIntent && typeof paymentIntent !== 'string' && paymentIntent.client_secret) {
      clientSecret = paymentIntent.client_secret;
      type = 'payment';
    } else {
      const setupIntent = await stripe.setupIntents.create({ customer: customer.id });
      clientSecret = setupIntent.client_secret!;
      type = 'setup';
    }

    res.status(200).json({ clientSecret, type });
  } catch (err: any) {
    console.error('Subscription creation error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});


//generating signed urls
async function generateSignedUrl(projectImage?: string | null): Promise<string> {
  if (!projectImage) {
    throw new Error("Invalid image provided")
  }
  const GetObjectParams = {
    Bucket: bucketName,
    Key: projectImage
  }
  const command = new GetObjectCommand(GetObjectParams);
  const url = await getSignedUrl(s3, command, { expiresIn: 3600 })
  return url
}




export default router;