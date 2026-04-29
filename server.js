import express from 'express';
import dotenv from "dotenv";
dotenv.config();
const app = express()
import { engine } from 'express-handlebars';
import adminRoute from './routes/admin.js';
import userRoute from './routes/user.js';
import path from 'path';
import { fileURLToPath } from 'url';
import nocache from 'nocache';
import session from 'express-session';
import { connectDB } from './db/connectDB.js'
import passport from 'passport';
import './config/passport.js';

app.use(nocache())
app.use(session({
    secret:process.env.SESSION_SECRET,
    resave:false,
    saveUninitialized:true,
    cookie:{
        maxAge:1000*60*60*24
    }
}))




const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.set('view engine', 'hbs');
app.use(express.static('public'));


app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.use(passport.initialize());
app.use(passport.session());

app.use('/admin',adminRoute)
app.use('/user',userRoute)
app.use('/',userRoute)


await connectDB()

app.listen(3000,()=>{
    console.log("server started")
})