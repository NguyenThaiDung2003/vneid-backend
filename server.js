const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
require('dotenv').config();

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const dbURI = process.env.MONGODB_URI;
mongoose.connect(dbURI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
})
.then(() => {
    console.log("Successfully connect to MongoDB.");
})
.catch(err => {
    console.error("Connection error", err);
    process.exit();
});

app.get("/", (req, res) => {
    res.json({ message: "Chào mừng đến với API của VNeID Clone." });
});

// === Route Registration ===
require('./routes/auth.routes')(app);
require('./routes/user.routes')(app);
require('./routes/admin.routes')(app);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`Server đang chạy trên cổng ${PORT}.`);
});