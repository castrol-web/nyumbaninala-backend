import mongoose from "mongoose";


const ProjectSchema = new mongoose.Schema({
    projectImage: { type: String },
    sponsors: { type: String },
    requirements: [{ type: String }],
    address: { type: String },
    goals: [{ type: String }],
    year: { type: String },
    contact: [{ phone: { type: String }, email: { type: String } }],
    title: { type: String },
    teamMembers: [{ name: { type: String }, role: { type: String } }],
    summary: { type: String }
});


export default mongoose.model("Projects", ProjectSchema);