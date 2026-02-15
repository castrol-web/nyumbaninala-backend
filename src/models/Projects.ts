import mongoose from "mongoose";


const ProjectSchema = new mongoose.Schema({
    projectImage: { type: String },
    title: { type: String },
    summary: { type: String }
});


export default mongoose.model("Projects", ProjectSchema);