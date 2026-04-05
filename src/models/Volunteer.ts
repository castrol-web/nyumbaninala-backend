import mongoose from "mongoose";

const VolunteerSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true },
    country: String,
    phone: String,
    gender: String,
    startDate: Date,
    endDate: Date,
    duration: Number, // calculated in days
    interests: [String],
    skills: String,
    message: String,
    status: { type: String, default: "pending" }
}, { timestamps: true });

export default mongoose.model("Volunteer", VolunteerSchema);