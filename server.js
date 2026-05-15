import express from 'express';
import { engine } from 'express-handlebars';
import dotenv from "dotenv";
dotenv.config();

import adminRoute from './routes/admin.js';
import userRoute from './routes/user.js';
import path from 'path';
import { fileURLToPath } from 'url';
import nocache from 'nocache';
import session from 'express-session';
import { connectDB } from './db/connectDB.js';
import passport from 'passport';
import './config/passport.js';

const app = express();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Handlebars engine setup
app.engine('hbs', engine({
    extname: '.hbs',
    defaultLayout: null,
    layoutsDir: path.join(__dirname, 'views/layouts'),
    partialsDir: path.join(__dirname, 'views/partials'),
    runtimeOptions: {
        allowProtoPropertiesByDefault: true,
        allowProtoMethodsByDefault: true
    },
    helpers: {
        add: (a, b) => a + b,
        subtract: (a, b) => a - b,
        gt: (a, b) => a > b,
        lt: (a, b) => a < b,
        eq: (a, b) => a === b,
        json: (context) => JSON.stringify(context),
        ifEquals: function (a, b, options) {
            return a === b ? options.fn(this) : options.inverse(this);
        }
    }
}));

app.set('view engine', 'hbs');
app.set('views', path.join(__dirname, 'views'));

// Middleware
app.use(nocache());
app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: true,
    cookie: {
        maxAge: 1000 * 60 * 60 * 24
    }
}));

app.use(express.static('public'));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.use(passport.initialize());
app.use(passport.session());

// Routes
app.use('/admin', adminRoute);
app.use('/user', userRoute);
app.use('/', userRoute);

await connectDB();

app.listen(3000, () => {
    console.log("Server started 3000");
});