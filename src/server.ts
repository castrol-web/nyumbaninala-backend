import dotenv from "dotenv";
dotenv.config();
import express from 'express';
import bodyParser from 'body-parser';
import http from "http";
import { Server } from "socket.io";
import mongoose from 'mongoose';
import cors from 'cors';
import adminRouter from "./routes/admin";
import userRouter from "./routes/User";


//cors
const app = express();
//cross origin middleware 
app.use(cors({
    origin: ["http://localhost:5173", "https://nyumbaninala.onrender.com"],
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
}));

//socket server
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: ["http://localhost:5173", "https://nyumbaninala.onrender.com"],
    }
})


io.on("connection", (socket) => {
    console.log("client connected", socket.id)
    socket.on("disconnect", () => {
        console.log("client disconnected")
    })
})

/* make io available in routes */
app.set("io", io);


//stripe webhook route
app.use(
    "/api/user/payments/webhook",
    bodyParser.raw({ type: "application/json" })
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(bodyParser.json());

const PORT = process.env.PORT;
const mongooseUrl = process.env.MONGO_URI;
//checking for mongoose url
if (!mongooseUrl) {
    throw new Error("MONGO_URI is not defined in your .env file")
}

// Connect to MongoDB and start server
mongoose.connect(mongooseUrl)
    .then(() => {
        console.log("Database connections successful")
    })
    .catch(err => console.log(`Database connection failed${err}`));

//router handlers
app.use('/api/admin', adminRouter);
app.use('/api/user', userRouter);

//listening port
server.listen(PORT, () => {
    console.log(`server running on port:${PORT}`)
})  