import mongoose, { Schema, Document, Model } from "mongoose"

export interface IProjectSection {
  title: string
  content: string
}

export interface IVolunteerOpportunity {
  title: string
  description: string
}

export interface IProject extends Document {
  name: string
  subtitle: string
  description: string
  leader: string
  leaderRole: string
  location: string
  coverImage: string
  status: "active" | "paused" | "completed"
  beneficiaries: number
  establishedYear: number
  sections: IProjectSection[]
  volunteerOpportunities: IVolunteerOpportunity[]
  tags: string[]
  contactEmail?: string
  website?: string
  createdAt: Date
  updatedAt: Date
}

const ProjectSectionSchema = new Schema<IProjectSection>(
  {
    title: { type: String, required: true },
    content: { type: String, required: true },
  },
  { _id: true }
)

const VolunteerOpportunitySchema = new Schema<IVolunteerOpportunity>(
  {
    title: { type: String, required: true },
    description: { type: String, required: true },
  },
  { _id: true }
)

const ProjectSchema = new Schema<IProject>(
  {
    name: { type: String, required: true },
    subtitle: { type: String, required: true },
    description: { type: String, required: true },
    leader: { type: String, required: true },
    leaderRole: { type: String, required: true },
    location: { type: String, required: true },
    coverImage: { type: String, default: "" },
    status: {
      type: String,
      enum: ["active", "paused", "completed"],
      default: "active",
    },
    beneficiaries: { type: Number, default: 0 },
    establishedYear: { type: Number, required: true },
    sections: [ProjectSectionSchema],
    volunteerOpportunities: [VolunteerOpportunitySchema],
    tags: [{ type: String }],
    contactEmail: { type: String },
    website: { type: String },
  },
  {
    timestamps: true,
  }
)

const Project: Model<IProject> =
  mongoose.models.Project || mongoose.model<IProject>("Project", ProjectSchema)

export default Project
