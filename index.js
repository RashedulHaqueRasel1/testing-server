const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const express = require('express');
const cors = require('cors');
const puppeteer = require('puppeteer');
const { GoogleGenerativeAI } = require("@google/generative-ai");
require('dotenv').config();

const app = express();
const port = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// Gemini AI Setup
// নিশ্চিত করুন .env ফাইলে GEMINI_API_KEY আছে
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.bhsplac.mongodb.net/?appName=Cluster0`;

const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

async function run() {
    try {
        // collections
        const db = client.db('test');
        const spotsCollection = db.collection('info');
        const analysisCollection = db.collection('productAnalyses');

        // Read & Show Data
        app.get('/spots', async (req, res) => {
            const cursor = spotsCollection.find();
            const result = await cursor.toArray();
            res.send(result);
        });

        // --- নতুন এপিআই: Product Analysis ---
// --- ফাইনাল ফিক্সড এপিআই ---
        app.post('/analyze-product', async (req, res) => {
            const { productUrl } = req.body;

            if (!productUrl) {
                return res.status(400).send({ message: "Product URL is required!" });
            }

            let browser;
            try {
                console.log("Starting Puppeteer...");
                browser = await puppeteer.launch({
                    headless: "new",
                    args: ['--no-sandbox', '--disable-setuid-sandbox']
                });
                const page = await browser.newPage();
                
                await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36');

                await page.goto(productUrl, { waitUntil: 'networkidle2', timeout: 60000 });

                const rawText = await page.evaluate(() => document.body.innerText);
                const cleanText = rawText.replace(/\s+/g, ' ').substring(0, 4000); 

                await browser.close();
                console.log("Scraping finished. Starting AI Analysis...");

                // ১. এখানে মডেলের নাম পরিবর্তন করা হয়েছে
                // যদি gemini-1.5-flash না চলে, তবে gemini-pro ট্রাই করুন
                const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" }); 

                const prompt = `Analyze this product data and provide a summary, 3 pros, 3 cons, and a trust score (1-10) in Bengali. Text: ${cleanText}`;

                // ২. API কল করার নিরাপদ পদ্ধতি
                const result = await model.generateContent(prompt);
                const response = result.response;
                const aiResponse = response.text();

                const analysisDoc = {
                    url: productUrl,
                    analysis: aiResponse,
                    timestamp: new Date(),
                };
                
                const saveResult = await analysisCollection.insertOne(analysisDoc);

                res.send({
                    success: true,
                    analysis: aiResponse,
                    insertedId: saveResult.insertedId
                });

            } catch (error) {
                if (browser) await browser.close();
                console.error("Analysis Error Details:", error);
                res.status(500).send({ 
                    message: "AI Analysis failed. Check your API Key or Model name.", 
                    error: error.message 
                });
            }
        });

        console.log("Connected to MongoDB successfully!");
    } catch (error) {
        console.error("MongoDB Connection Error:", error);
    }
}
run().catch(console.dir);

app.get('/', (req, res) => {
    res.send("Asia Adventure Server is Running");
});

app.listen(port, () => {
    console.log(`Server is running on port: ${port}`);
});