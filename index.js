const { MongoClient, ServerApiVersion } = require('mongodb');
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcrypt');
const http = require('http');
const { Server } = require('socket.io');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 5000;

// middleware
app.use(cors());
app.use(express.json());

// http + socket
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*" }
});

// mongo
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.bhsplac.mongodb.net/?appName=Cluster0`;

const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});


function generateFourLetterName() {
    const upper = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    const lower = "abcdefghijklmnopqrstuvwxyz";

    let name = "";

    // First letter (Capital)
    name += upper[Math.floor(Math.random() * upper.length)];

    // Next 3 letters (small)
    for (let i = 0; i < 3; i++) {
        name += lower[Math.floor(Math.random() * lower.length)];
    }

    return name;
}


async function run() {
    await client.connect();

    const db = client.db("test");
    const codesCollection = db.collection("codes");
    const messagesCollection = db.collection("message");
    const usersCollection = db.collection("users");


    //  FORCE REMOVE email unique index if exists
    const indexes = await usersCollection.indexes();
    const emailIndex = indexes.find(i => i.name === "email_1");

    if (emailIndex) {
        await usersCollection.dropIndex("email_1");
        console.log("❌ email_1 index removed");
    }



    // TTL index for OTP (2 minutes)
    await codesCollection.createIndex(
        { createdAt: 1 },
        { expireAfterSeconds: 120 }
    );

    console.log("MongoDB Connected");

    // =============================
    // Generate Code (PC)
    // =============================
    app.post("/generate-code", async (req, res) => {
        const code = Math.floor(1000 + Math.random() * 9000).toString();
        const hashedCode = await bcrypt.hash(code, 10);

        const doc = {
            code: hashedCode,
            createdAt: new Date()
        };

        const result = await codesCollection.insertOne(doc);

        res.send({
            success: true,
            code,
            roomId: result.insertedId.toString()
        });
    });

    // =============================
    // Verify Code (Mobile)
    // =============================

    app.post("/verify-code", async (req, res) => {
        const { code, mobileId } = req.body;

        if (!code) {
            return res.status(400).send({
                success: false,
                message: "Code missing"
            });
        }

        const codes = await codesCollection.find().toArray();

        for (const item of codes) {
            const match = await bcrypt.compare(code, item.code);

            if (match) {
                // OTP single-use
                await codesCollection.deleteOne({ _id: item._id });

                const name = generateFourLetterName();

                try {
                    const newUser = {
                        name,
                        mobileId: mobileId || null,
                        roomId: item._id.toString(),
                        createdAt: new Date()
                    };

                    const userResult = await usersCollection.insertOne(newUser);

                    return res.send({
                        success: true,
                        roomId: item._id.toString(),
                        userId: userResult.insertedId.toString(),
                        name
                    });

                } catch (err) {
                    console.error("User insert error:", err);
                    return res.status(500).send({
                        success: false,
                        message: "User creation failed"
                    });
                }
            }
        }

        res.send({
            success: false,
            message: "Invalid code"
        });
    });

}

run().catch(console.error);

// =============================
// SOCKET LOGIC
// =============================
io.on("connection", (socket) => {
    console.log("Connected:", socket.id);

    socket.on("pc-join", ({ roomId }) => {
        socket.join(roomId);
        console.log("PC joined:", roomId);
    });

    socket.on("mobile-join", ({ roomId }) => {
        socket.join(roomId);
        socket.to(roomId).emit("mobile-connected");
        console.log("Mobile joined:", roomId);
    });

    socket.on("send-data", async ({ roomId, payload }) => {
        try {
            socket.to(roomId).emit("receive-data", payload);

            await client.db("test").collection("message").insertOne({
                roomId,
                senderId: socket.id,
                payload,
                timestamp: new Date()
            });
        } catch (err) {
            console.error("Message save error:", err);
        }
    });

    socket.on("disconnect", () => {
        console.log("Disconnected:", socket.id);
    });
});

// base route
app.get("/", (req, res) => {
    res.send("PC ↔ Mobile Pairing Server Running");
});

server.listen(port, () => {
    console.log(`Server running on port ${port}`);
});
