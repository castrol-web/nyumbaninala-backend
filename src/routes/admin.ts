import dotenv from "dotenv";
dotenv.config();
import express, { Request } from "express";
import bcrypt from "bcryptjs";
import multer from "multer";
import crypto from "crypto";
import User from "../models/User";
import Projects from "../models/Projects";
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import Partner from "../models/Partner";
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
router.post("/create/projects", upload.single('projectImage'), async (req, res) => {
    try {

        const { title, summary } = req.body; // data is a JSON string
        if (!title || !summary) {
            return res.status(400).json({ message: "A project should have atleast a title and a summary" })
        }
        const projectImage = randomImageName();
        if (!req.file || !req.file.buffer) {
            return res.status(400).json({ message: "Project image is required" })
        }
        const params = {
            Bucket: bucketName,
            Key: projectImage,
            Body: req.file.buffer,
            ContentType: req.file.mimetype
        }
        const command = new PutObjectCommand(params);
        await s3.send(command);
        const newProject = new Projects({
            title,
            summary,
            projectImage,
        })
        await newProject.save();
        res.status(200).json({ message: "project created successfully" })
    } catch (error) {
        //multer errors
        if (error instanceof multer.MulterError) {
            return res.status(400).json({ message: error.message })
        }
        console.error(error);
        res.status(500).json({ message: "Internal server error" });
    }
})


//deleting a project
router.delete("/delete/project/:id", async (req, res) => {
    try {
        const projectId = req.params.id;
        const project = await Projects.findById(projectId);
        if (!project) return res.status(404).json({ message: "Project not found" });

        // Delete image from S3
        if (project.projectImage) {
            await s3.send(new DeleteObjectCommand({ Bucket: bucketName, Key: project.projectImage }));
        }

        await Projects.findByIdAndDelete(projectId);
        res.status(200).json({ message: "Project deleted successfully" });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Internal server error" });
    }
});


//update or edit a project details
router.put("/edit/project/:id", upload.single("projectImage"), async (req, res) => {
    try {
        const projectId = req.params.id;
        const project = await Projects.findById(projectId);
        if (!project) return res.status(404).json({ message: "Project not found" });

        const { title, summary} = req.body; // data is a JSON string
        if (!title || !summary) {
            return res.status(400).json({ message: "A project should have at least a title and a summary" });
        }

        // If new image uploaded, delete old one and upload new one
        if (req.file && req.file.buffer) {
            if (project.projectImage) {
                await s3.send(new DeleteObjectCommand({ Bucket: bucketName, Key: project.projectImage }));
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
            project.projectImage = newImageKey;
        }

        // Update other fields
        Object.assign(project, { title, summary });
        await project.save();

        res.status(200).json({ message: "Project updated successfully" });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Internal server error" });
    }
});





export default router;

