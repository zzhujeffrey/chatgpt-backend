require("dotenv").config();
const express = require("express");
const axios = require("axios");
const cors = require("cors");
const fs = require("fs");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(cors());

const CHAT_HISTORY_FILE = "chatHistory.json"; // 🔹 Stores chat history locally

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

// 🔹 Handle Chat Requests (Now logs each survey separately)
app.post("/chat", async (req, res) => {
    try {
        const { message, sessionId } = req.body;
        let chatHistory = loadChatHistory();

        // Initialize session if not found
        if (!chatHistory[sessionId]) {
            chatHistory[sessionId] = [];
        }

        // Retrieve past messages for context
        const pastMessages = chatHistory[sessionId].slice(-10); // Limit to last 10 messages
        pastMessages.push({ role: "user", content: message });

        // 🔹 Send conversation history to OpenAI
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

        // Store conversation under unique survey session ID
        chatHistory[sessionId].push({ role: "user", content: message });
        chatHistory[sessionId].push({ role: "assistant", content: bot_reply });
        saveChatHistory(chatHistory);

        res.json({ reply: bot_reply });

    } catch (error) {
        console.error("Error:", error.response ? error.response.data : error);
        res.status(500).json({ error: "Something went wrong." });
    }
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
