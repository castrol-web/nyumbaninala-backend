import mongoose from "mongoose";

const partnerSchema = new mongoose.Schema(
  {
    fullName: { type: String, required: true },
    organizationName: { type: String },
    email: { type: String, required: true },
    phone: { type: String, required: true },
    country: { type: String, required: true },
    website: { type: String },
    partnershipType: {
      type: String,
      enum: ["sponsor", "ngo", "corporate", "media"],
      required: true,
    },
    proposal: { type: String, required: true },

    documentUrl: { type: String },

    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
    },

    adminNotes: { type: String },

    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    reviewedAt: { type: Date },
  },
  { timestamps: true }
);

export default mongoose.model("Partner", partnerSchema);
