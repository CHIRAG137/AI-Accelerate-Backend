const express = require("express");
const mongoose = require("mongoose");
const bodyParser = require("body-parser");
const cors = require("cors");
const path = require("path");
const botRoutes = require("./routes/botRoutes");
const crawlRoutes = require("./routes/crawlRoutes");
const slackRoutes = require("./routes/slackRoutes");
const authRoutes = require("./routes/authRoutes");
const flowRoutes = require("./routes/flowRoutes");
const summarizeRoutes = require("./routes/summarizeRoutes");
require("dotenv").config();

const app = express();

app.use(
  cors({
    origin: ["http://localhost:8080", "https://tastebot-studio.onrender.com"],
    credentials: true,
  })
);

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

mongoose
  .connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => console.log("MongoDB connected"))
  .catch((err) => console.error("MongoDB error:", err));

app.use("/api/bots", botRoutes);
app.use("/api/scrape", crawlRoutes);
app.use("/api/slack", slackRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/flow", flowRoutes);
app.use("/api/summarize", summarizeRoutes);
app.get("/widget.js", (req, res) => {
  res.sendFile(path.join(__dirname, "public/widget.js"));
});

// keep-alive endpoint
app.get('/api/keep-alive', (req, res) => {
  res.status(200).json({
    status: 'alive',
    timestamp: new Date().toISOString(),
    uptime: Math.floor(process.uptime())
  });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
