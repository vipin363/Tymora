import express from 'express';
const app = express()
import adminRoute from './routes/admin.js';
import userRoute from './routes/user.js';
import path from 'path';
import { fileURLToPath } from 'url';
import nocache from 'nocache';
import session from 'express-session';
import { connectDB } from './db/connectDB.js'

app.use(nocache())
app.use(session({
    secret:'mysecretkey',
    resave:false,
    saveUninitialized:true,
    cookie:{
        maxAge:1000*60*60*24
    }
}))



const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
app.set('view engine','hbs');
app.use(express.static('public'));




app.use('/admin',adminRoute)
app.use('/user',userRoute)
app.use('/',userRoute)


connectDB()

app.listen(3000,()=>{
    console.log("server started")
})