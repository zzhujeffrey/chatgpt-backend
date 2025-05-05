require("dotenv").config();
const express = require("express");
const axios = require("axios");
const cors = require("cors");
const fs = require("fs");
const createCsvWriter = require("csv-writer").createObjectCsvWriter;

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(cors());

const CHAT_HISTORY_FILE = "chatHistory.json";
const CSV_FILE = "chatLogs.csv";

// 🔹 CSV Writer setup
const csvWriter = createCsvWriter({
    path: CSV_FILE,
    header: [
        { id: "sessionId", title: "Survey Session ID" },
        { id: "userEmail", title: "User Email" },
        { id: "user_message", title: "User Message" },
        { id: "bot_response", title: "Bot Response" },
        { id: "timestamp", title: "Timestamp" }
    ],
    append: true
});

// 🔹 Load existing chat history
function loadChatHistory() {
    try {
        const data = fs.readFileSync(CHAT_HISTORY_FILE, "utf8");
        return JSON.parse(data);
    } catch {
        return {};
    }
}

// 🔹 Save updated chat history
function saveChatHistory(history) {
    fs.writeFileSync(CHAT_HISTORY_FILE, JSON.stringify(history, null, 2));
}

// 🔹 Append a single chat record to CSV
function saveChatToCSV(sessionId, userEmail, user_message, bot_response) {
    const logEntry = [{
        sessionId,
        userEmail,
        user_message,
        bot_response,
        timestamp: new Date().toISOString()
    }];
    csvWriter.writeRecords(logEntry).catch(err => console.error("CSV Write Error:", err));
}

// 🔹 Handle Chat
app.post("/chat", async (req, res) => {
    try {
        const { message, sessionId, userEmail } = req.body;

        // Optional: server-side email validation
        if (!/^[^\s@]+@uw\.edu$/.test(userEmail)) {
            return res.status(400).json({ error: "Invalid email address." });
        }

        let chatHistory = loadChatHistory();

        if (!chatHistory[sessionId]) {
            chatHistory[sessionId] = [];
        }

        const pastMessages = chatHistory[sessionId].slice(-10);
        pastMessages.push({ role: "user", content: message });

        const response = await axios.post(
            "https://api.openai.com/v1/chat/completions",
            {
                model: "gpt-4",
                messages: pastMessages
            },
            {
                headers: {
                    "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
                    "Content-Type": "application/json"
                }
            }
        );

        const bot_reply = response.data.choices[0].message.content;

        chatHistory[sessionId].push({ role: "user", content: message });
        chatHistory[sessionId].push({ role: "assistant", content: bot_reply });
        saveChatHistory(chatHistory);

        saveChatToCSV(sessionId, userEmail, message, bot_reply);

        res.json({ reply: bot_reply });
    } catch (error) {
        console.error("Error:", error.response ? error.response.data : error);
        res.status(500).json({ error: "Something went wrong." });
    }
});

// 🔹 Endpoint to get full chat history
app.get("/chat-history", (req, res) => {
    try {
        const chatHistory = loadChatHistory();
        res.json(chatHistory);
    } catch {
        res.status(500).json({ error: "Could not retrieve chat history." });
    }
});

// 🔹 Endpoint to download logs
app.get("/download-chat-logs", (req, res) => {
    const filePath = "./chatLogs.csv";
    res.download(filePath, "chatLogs.csv", (err) => {
        if (err) {
            console.error("File Download Error:", err);
            res.status(500).send("Error downloading file.");
        }
    });
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
