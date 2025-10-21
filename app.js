const express = require("express");
const mongoose = require("mongoose");
const bodyParser = require("body-parser");
const cors = require("cors");
const path = require("path");
const logger = require("./utils/logger");
const botRoutes = require("./routes/botRoutes");
const crawlRoutes = require("./routes/crawlRoutes");
const slackRoutes = require("./routes/slackRoutes");
const authRoutes = require("./routes/authRoutes");
const flowRoutes = require("./routes/flowRoutes");
const summarizeRoutes = require("./routes/summarizeRoutes");
const { testConnection, esClient } = require("./config/elasticSearch");
const { initializeIndices } = require("./utils/elasticSetup");
require("dotenv").config();

const app = express();

app.use(
  cors({
    origin: ["http://localhost:8080", "https://ai-accelerate-frontend.onrender.com"],
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
app.get("/api/keep-alive", (req, res) => {
  res.status(200).json({
    status: "alive",
    timestamp: new Date().toISOString(),
    uptime: Math.floor(process.uptime()),
  });
});

async function initializeDatabases() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    logger.info("MongoDB connected successfully");

    // Test Elasticsearch connection
    const esConnected = await testConnection();
    if (!esConnected) {
      throw new Error("Failed to connect to Elasticsearch");
    }

    // Initialize Elasticsearch indices
    await initializeIndices();
    logger.info("Elasticsearch indices initialized successfully");

    return true;
  } catch (error) {
    logger.error("Database initialization failed", { error: error.message });
    throw error;
  }
}

const PORT = process.env.PORT || 5000;

initializeDatabases()
  .then(() => {
    app.listen(PORT, () => {
      logger.info(`Server running on port ${PORT}`, {
        environment: process.env.NODE_ENV,
        elasticsearch: "enabled",
        hybridSearch: "active",
      });
    });
  })
  .catch((error) => {
    logger.error("Failed to start server", { error: error.message });
    process.exit(1);
  });

// Graceful shutdown
process.on("SIGTERM", async () => {
  logger.info("SIGTERM received, shutting down gracefully");

  try {
    await mongoose.connection.close();
    await esClient.close();
    logger.info("Database connections closed");
    process.exit(0);
  } catch (error) {
    logger.error("Error during shutdown", { error: error.message });
    process.exit(1);
  }
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
