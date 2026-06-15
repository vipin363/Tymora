import express from 'express';
import helmet from 'helmet';
import { engine } from 'express-handlebars';
import dotenv from 'dotenv';
dotenv.config();
import adminRoute from './routes/admin.js';
import userRoute from './routes/user.js';
import path from 'path';
import { fileURLToPath } from 'url';
import nocache from 'nocache';
import session from 'express-session';
import cookieParser from 'cookie-parser';
import { connectDB } from './db/connectDB.js';
import passport from 'passport';
import './config/passport.js';
import { captureReferral } from './middleware/captureReferral.js';
import Order from './model/orderModel.js';
const app = express();
app.use(
  helmet({
    contentSecurityPolicy: false,
  })
);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Handlebars engine setup
app.engine(
  'hbs',
  engine({
    extname: '.hbs',
    defaultLayout: null,
    layoutsDir: path.join(__dirname, 'views/layouts'),
    partialsDir: path.join(__dirname, 'views/partials'),
    runtimeOptions: {
      allowProtoPropertiesByDefault: true,
      allowProtoMethodsByDefault: true,
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
      },
      formatCurrency: (value) => {
        if (value == null) return '0';
        return Number(value).toLocaleString('en-IN');
      },
      toLowerCase: (str) => {
        if (typeof str === 'string') return str.toLowerCase();
        return '';
      },
      substr: (str, start, length) => {
        if (typeof str === 'string') return str.substring(start, length);
        return '';
      },
      times: function (n, block) {
        let accum = '';
        for (let i = 0; i < n; i++) accum += block.fn(i);
        return accum;
      },
      formatDate: (dateStr) => {
        if (!dateStr) return '';
        const d = new Date(dateStr);
        return d.toLocaleDateString('en-GB'); // DD/MM/YYYY
      },
      replace: (str, find, replaceWith) => {
        if (typeof str !== 'string') return str;
        return str.split(find).join(replaceWith);
      },
      sumByType: (arr, type) => {
        if (!Array.isArray(arr)) return 0;
        return arr
          .filter((t) => t.type === type)
          .reduce((sum, t) => sum + (t.amount || 0), 0);
      },
      addOne: (index) => index + 1,
      formatDateTime: (dateStr) => {
        if (!dateStr) return '';
        const d = new Date(dateStr);
        return (
          d.toLocaleDateString('en-GB') +
          ' ' +
          d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
        );
      },
      todayDate: () => new Date().toISOString().split('T')[0],
    },
  })
);

app.set('view engine', 'hbs');
app.set('views', path.join(__dirname, 'views'));

// Middleware
app.use(nocache());
app.set('trust proxy', 1);

app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 1000 * 60 * 60 * 24,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
    },
  })
);

app.use(cookieParser());
app.use(express.static('public'));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(captureReferral); // Capture ?ref= from any page globally

app.use(passport.initialize());
app.use(passport.session());

// Routes
app.use('/admin', adminRoute);
app.use('/user', userRoute);
app.use('/', userRoute);

// Global 404 Error Handler
app.use((req, res, next) => {
  res.status(404).render('user/404', { layout: false });
});

await connectDB();

// Background cleanup for abandoned Razorpay orders (runs every 15 minutes)
setInterval(
  async () => {
    try {
      const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);
      const result = await Order.deleteMany({
        orderStatus: 'Payment Pending',
        createdAt: { $lt: thirtyMinutesAgo },
      });
      if (result.deletedCount > 0) {
        console.log(
          `[Cleanup] Deleted ${result.deletedCount} abandoned Payment Pending orders.`
        );
      }
    } catch (err) {
      console.error('[Cleanup] Error deleting abandoned orders:', err);
    }
  },
  15 * 60 * 1000
);

app.listen(3000, () => {
  console.log('Server started 3000');
});
