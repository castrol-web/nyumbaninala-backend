import dotenv from "dotenv";
dotenv.config();
import express, { Request } from "express";
import bcrypt from "bcryptjs";
import multer from "multer";
import crypto from "crypto";
import User from "../models/User";
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import Partner from "../models/Partner";
import Project from "../models/Project";
const router = express.Router();

const adminPassword = process.env.ADMIN_PASSWORD;
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


const storage = multer.memoryStorage();
const upload = multer({ storage });
const randomImageName = (bytes = 32) => crypto.randomBytes(bytes).toString('hex');


//creating sudo admin
const sudoAdmin = async () => {
    try {
        const admin = await User.findOne({ email: "admin@example.com" });
        if (admin) {
            console.log("Admin user already exists")
            return;
        }
        //hashing the password
        const salt = await bcrypt.genSalt(Number(process.env.SALT) || 10);
        const hashedPassword = await bcrypt.hash(adminPassword || "adminpassword", salt);
        const newAdmin = new User({
            userName: "admin",
            email: "admin@example.com",
            phone: "0790792533",
            passwordHash: hashedPassword,
            role: "admin",
            isVerified: true
        });
        await newAdmin.save();
        console.log("Admin user created successfully");
    } catch (error) {
        console.error('Error seeding admin user:', error);
    }
}

sudoAdmin();


//get all partners
router.get("/admin/partners", async (req, res) => {
    const partners = await Partner.find();
    res.json(partners);
});

//approve a partner application
router.put("/admin/partners/:id/approve", async (req, res) => {
    const partner = await Partner.findById(req.params.id);
    if (!partner) return res.status(404).json({ message: "Partner not found" });
    partner.status = "approved";
    partner.reviewedAt = new Date();
    // partner.reviewedBy = req.user._id;

    await partner.save();

    res.json({ message: "Partner approved successfully" });
});


router.put("/admin/partners/:id/reject", async (req, res) => {
    const { note } = req.body;

    const partner = await Partner.findById(req.params.id);
    if (!partner) return res.status(404).json({ message: "Partner not found" });

    partner.status = "rejected";
    partner.adminNotes = note;
    partner.reviewedAt = new Date();
    // partner.reviewedBy = req.user._id;

    await partner.save();

    res.json({ message: "Partner rejected" });
});




//add a project
router.post("/projects", upload.single("coverImage"), async (req, res) => {
    try {
        //get required fields
        const { description, name, subtitle } = req.body;
        const coverImage = req.file

        // Validate required fields (matching your original validation)
        if (!name || !subtitle || !description) {
            return res.status(400).json({ message: "A project should have at least a name, subtitle, and description" });
        }

        // Validate image
        if (!coverImage) {
            return res.status(400).json({ message: "Cover image is required" });
        }

        // Upload image to S3
        const imageKey = randomImageName()
        await s3.send(
            new PutObjectCommand({
                Bucket: bucketName,
                Key: imageKey,
                Body: coverImage.buffer,
                ContentType: coverImage.mimetype,
            })
        )

        // Get optional fields
        const leader = (req.body.leader as string) || ""
        const leaderRole = (req.body.leaderRole as string) || ""
        const location = (req.body.location as string) || ""
        const status = (req.body.status as string) || "active"
        const beneficiaries = parseInt((req.body.beneficiaries as string) || "0")
        const establishedYear = parseInt((req.body.establishedYear as string) || new Date().getFullYear().toString())
        const contactEmail = req.body.contactEmail as string
        const website = req.body.website as string

        // Parse JSON fields (sections, volunteerOpportunities, tags)
        let sections = []
        let volunteerOpportunities = []
        let tags: string[] = []

        try {
            const sectionsStr = req.body.sections as string
            if (sectionsStr) sections = JSON.parse(sectionsStr)
        } catch {
            sections = []
        }

        try {
            const volunteerStr = req.body.volunteerOpportunities as string
            if (volunteerStr) volunteerOpportunities = JSON.parse(volunteerStr)
        } catch {
            volunteerOpportunities = []
        }

        try {
            const tagsStr = req.body.tags as string
            if (tagsStr) tags = JSON.parse(tagsStr)
        } catch {
            tags = []
        }

        // Create project
        const project = new Project({
            name,
            subtitle,
            description,
            leader,
            leaderRole,
            location,
            coverImage: imageKey, // Store S3 key
            status,
            beneficiaries,
            establishedYear,
            sections,
            volunteerOpportunities,
            tags,
            contactEmail,
            website,
        })

        await project.save()

        return res.status(201).json(
            { message: "Project created successfully", project }
        )
    } catch (error) {
        console.error("Error creating project:", error)
        return res.status(500).json(
            { message: "Internal server error" }
        )
    }
})


// //update or edit a project details
router.put("/edit/project/:id", upload.single("coverImage"), async (req, res) => {
    try {
        const projectId = req.params.id;

        const project = await Project.findById(projectId);
        if (!project) {
            return res.status(404).json({ message: "Project not found" });
        }

        const {
            name,
            subtitle,
            description,
            leader,
            leaderRole,
            location,
            status,
            beneficiaries,
            establishedYear,
            contactEmail,
            website,
            sections,
            volunteerOpportunities,
            tags
        } = req.body;

        // Minimum validation
        if (!name || !description) {
            return res.status(400).json({
                message: "Project must have at least name and description",
            });
        }

        // Parse JSON fields (because they come from FormData)
        const parsedSections = sections ? JSON.parse(sections) : [];
        const parsedVolunteerOpportunities = volunteerOpportunities
            ? JSON.parse(volunteerOpportunities)
            : [];
        const parsedTags = tags ? JSON.parse(tags) : [];

        // Handle image upload
        if (req.file && req.file.buffer) {
            if (project.coverImage) {
                await s3.send(
                    new DeleteObjectCommand({
                        Bucket: bucketName,
                        Key: project.coverImage,
                    })
                );
            }

            const newImageKey = randomImageName();

            await s3.send(
                new PutObjectCommand({
                    Bucket: bucketName,
                    Key: newImageKey,
                    Body: req.file.buffer,
                    ContentType: req.file.mimetype,
                })
            );

            project.coverImage = newImageKey;
        }

        // Update project fields
        project.name = name;
        project.subtitle = subtitle;
        project.description = description;
        project.leader = leader;
        project.leaderRole = leaderRole;
        project.location = location;
        project.status = status;
        project.beneficiaries = beneficiaries;
        project.establishedYear = establishedYear;
        project.contactEmail = contactEmail;
        project.website = website;
        project.sections = parsedSections;
        project.volunteerOpportunities = parsedVolunteerOpportunities;
        project.tags = parsedTags;

        project.updatedAt = new Date();

        await project.save();

        res.status(200).json({
            message: "Project updated successfully",
            project,
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({
            message: "Internal server error",
        });
    }
});

//delete a project
router.delete("/delete/project/:id", async (req, res) => {
    try {
        const projectId = req.params.id;

        const project = await Project.findById(projectId);

        if (!project) {
            return res.status(404).json({
                message: "Project not found",
            });
        }

        // Delete image from S3
        try {
            if (project.coverImage) {
                await s3.send(
                    new DeleteObjectCommand({
                        Bucket: bucketName,
                        Key: project.coverImage,
                    })
                );
            }
        } catch (err) {
            console.warn("Failed to delete image from S3", err);
        }

        // Delete project from DB
        await Project.findByIdAndDelete(projectId);

        res.status(200).json({
            message: "Project deleted successfully",
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            message: "Failed to delete project",
        });
    }
});





export default router;

