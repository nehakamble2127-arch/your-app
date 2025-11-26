const express = require("express");
const cors = require("cors");

const connectDB = require("./config/db");
const authRoutes = require("./routes/auth");

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Connect MongoDB
connectDB();

// Routes
app.use("/auth", authRoutes);

// Start Server
app.listen(5000, () => {
  console.log("Server running on http://localhost:5000");
});
