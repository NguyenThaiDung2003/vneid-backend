const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const cookieParser = require("cookie-parser"); // <- Thêm dòng này
require('dotenv').config();

const app = express();

const corsOptions = {
    origin: ['http://localhost:3000','http://localhost:5173', 'http://127.0.0.1:3000'], // Frontend URLs
    credentials: true, // Cho phép gửi cookies
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
        'Origin',
        'X-Requested-With', 
        'Content-Type', 
        'Accept',
        'Authorization',
        'x-access-token'
    ],
    exposedHeaders: ['x-access-token'], // Nếu cần expose custom headers
    optionsSuccessStatus: 200 // Cho IE11
};
app.use(cookieParser()); // <- Phải đặt trước các route
app.use(cors(corsOptions));
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