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

const CHAT_HISTORY_FILE = "chatHistory.json"; // Stores chat history locally
const CSV_FILE = "chatLogs.csv"; // Stores chat logs for Qualtrics matching

// 🔹 Create CSV Writer
const csvWriter = createCsvWriter({
    path: CSV_FILE,
    header: [
        { id: "sessionId", title: "Survey Session ID" },
        { id: "user_message", title: "User Message" },
        { id: "bot_response", title: "Bot Response" },
        { id: "timestamp", title: "Timestamp" }
    ],
    append: true // Append new chats instead of overwriting
});

// 🔹 Load chat history from file
function loadChatHistory() {
    try {
        const data = fs.readFileSync(CHAT_HISTORY_FILE, "utf8");
        return JSON.parse(data);
    } catch (error) {
        return {}; // Return empty object if file does not exist
    }
}

// 🔹 Save chat history to file
function saveChatHistory(history) {
    fs.writeFileSync(CHAT_HISTORY_FILE, JSON.stringify(history, null, 2));
}

// 🔹 Function to Save Chats to CSV
function saveChatToCSV(sessionId, user_message, bot_response) {
    const logEntry = [{
        sessionId,
        user_message,
        bot_response,
        timestamp: new Date().toISOString()
    }];

    csvWriter.writeRecords(logEntry).catch(err => console.error("CSV Write Error:", err));
}

// 🔹 Handle Chat Requests (Now logs each survey separately)
app.post("/chat", async (req, res) => {
    try {
        const { message, sessionId } = req.body;
        let chatHistory = loadChatHistory();

        if (!chatHistory[sessionId]) {
            chatHistory[sessionId] = [];
        }

        // Retrieve past messages for context
        const pastMessages = chatHistory[sessionId].slice(-10);
        pastMessages.push({ role: "user", content: message });

        // Send conversation history to OpenAI
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

        // Store conversation in JSON
        chatHistory[sessionId].push({ role: "user", content: message });
        chatHistory[sessionId].push({ role: "assistant", content: bot_reply });
        saveChatHistory(chatHistory);

        // 🔹 Save to CSV for easy Qualtrics matching
        saveChatToCSV(sessionId, message, bot_reply);

        res.json({ reply: bot_reply });

    } catch (error) {
        console.error("Error:", error.response ? error.response.data : error);
        res.status(500).json({ error: "Something went wrong." });
    }
});

// 🔹 Serve chat history via an API endpoint
app.get("/chat-history", (req, res) => {
    try {
        const chatHistory = loadChatHistory();
        res.json(chatHistory);
    } catch (error) {
        res.status(500).json({ error: "Could not retrieve chat history." });
    }
});

// 🔹 Serve `chatLogs.csv` for direct download
app.get("/download-chat-logs", (req, res) => {
    const filePath = "./chatLogs.csv"; // Ensure file is in backend folder
    res.download(filePath, "chatLogs.csv", (err) => {
        if (err) {
            console.error("File Download Error:", err);
            res.status(500).send("Error downloading file.");
        }
    });
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
