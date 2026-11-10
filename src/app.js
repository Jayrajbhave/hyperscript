
require("dotenv").config();

const express = require("express");
const path = require("path");
const mongoose = require("mongoose");
const cookieParser = require("cookie-parser");

const { checkForAuthenticationCookie } = require("./middleware/auth.middleware.js");

const Blog = require("./modules/blog.modules.js");
const userRoute = require("./routes/user.routes.js");
const blogRoute = require("./routes/blog.routes.js");

const app = express();
const PORT = process.env.PORT || 8080;

// Database connection
let dbPromise;

app.use(async (req, res, next) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      dbPromise ||= mongoose.connect(process.env.MONGO_URL);
      await dbPromise;
    }
    next();
  } catch (error) {
    console.error("MongoDB connection error:", error);
    next(error);
  }
});

// EJS configuration
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

// Middleware
app.use(express.urlencoded({ extended: false }));
app.use(express.json());
app.use(cookieParser());
app.use(checkForAuthenticationCookie("token"));

// Static files (local development)
app.use(express.static(path.join(__dirname, "../public")));

// Home route
app.get("/", async (req, res, next) => {
  try {
    const allBlogs = await Blog.find({});

    res.render("home", {
      user: req.user,
      blogs: allBlogs,
    });
  } catch (error) {
    next(error);
  }
});

// Application routes
app.use("/user", userRoute);
app.use("/blog", blogRoute);

// Error handler
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).send("Internal Server Error");
});

// Local development only
if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
  });
}

// Export Express application for Vercel
module.exports = app;
