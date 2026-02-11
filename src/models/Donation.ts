import mongoose from "mongoose";
const DonationSchema = new mongoose.Schema({
    type: String, // one_time | subscription
    amount: Number,
    currency: String,
    email: String,
    metadata: {
        type: Map,
        of: String,
    },
    status: String,
    stripePaymentIntentId: String,
    stripeSubscriptionId: String,
    stripeInvoiceId: String,
    createdAt: { type: Date, default: Date.now }
});

export default mongoose.model("Donation", DonationSchema);