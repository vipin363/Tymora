import express  from 'express';
const router=express.Router()
import { isLogin,isAuth,hasOtpSession,hasForgotSession,hasResetVerified } from '../middleware/userAuth.js';
import { loadLogin,login,loadRegister,registerUser,homePage,logout,loadForgotPassword,forgotPassword,loadResetPassword,resetPassword,loadProfile,loadEditProfile,updateProfile,changeEmail,verifyChangeEmail,resendChangeEmailOtp,deleteAccount,changePassword,loadAddressPage,addAddress,updateAddress,getAddress,setDefaultAddress,deleteAddress,loadshop } from '../controller/userController.js';
import { loadOtpPage,verifyOtp,resendOtp,loadForgotOtpPage,verifyForgotOtp } from '../controller/otpController.js';
import  passport from 'passport';
import upload from '../middleware/uploard.js';
import { attachCategories } from "../middleware/attachCategories.js";

router.use(attachCategories);

router.get('/',homePage);
router.get('/login',isLogin,loadLogin)
router.post('/login',login)


router.get('/register',isLogin,loadRegister)
router.post('/register',registerUser)

router.get('/otp',hasOtpSession,loadOtpPage)
router.post('/verifyOtp',hasOtpSession,verifyOtp)
router.get('/resendOtp',resendOtp);

router.get('/logout',isAuth,logout)

router.get('/forgotPassword', isLogin,loadForgotPassword);
router.post('/forgotPassword',forgotPassword);

router.get('/forgotOtp',hasForgotSession,loadForgotOtpPage);
router.post('/verifyForgotOtp',hasForgotSession,verifyForgotOtp);

router.get('/resetPassword', hasResetVerified,loadResetPassword);
router.post('/resetPassword', hasResetVerified , resetPassword);

router.get('/home',(req,res)=>{
   res.redirect('/user/');
});

router.get('/auth/google/login', (req, res, next) => {
  req.session.googleAuthType = 'login'; 
  next();
}, passport.authenticate('google', { scope: ['profile','email'] }));

router.get('/auth/google/register', (req, res, next) => {
  req.session.googleAuthType = 'register'; 
  next();
}, passport.authenticate('google', { scope: ['profile','email'] }));

router.get('/auth/google/callback', (req, res, next) => {
  passport.authenticate('google', (err, user, info) => {
    if (err) return next(err);
    const isRegister = req.session.googleAuthType === 'register';
    if (!user) {
      req.session.googleAuthType = null; 
      if (isRegister) {
        return res.redirect(`/user/register?message=${info.message}`);
      } else {
        return res.redirect(`/user/login?message=${info.message}`);
      }}
    req.session.user = {
      id: user._id,
      name: user.name
    };
    req.session.googleAuthType = null; 
    res.redirect('/user/home');
  })(req, res, next);});
  

router.get('/profile', isAuth, loadProfile);
router.get('/editProfile', isAuth, loadEditProfile);
router.post('/updateProfile', isAuth, upload.single('avatar'), updateProfile);

router.post('/changeEmail', isAuth, changeEmail);
router.post('/verifyEmailOtp', isAuth, verifyChangeEmail);
router.post('/resendEmailOtp', isAuth, resendChangeEmailOtp);

router.post('/changePassword', isAuth, changePassword);

router.post('/deleteAccount', isAuth, deleteAccount);

router.get('/address', isAuth, loadAddressPage);
router.post("/addAddress", isAuth,addAddress);
router.get("/getAddress/:id",isAuth, getAddress);
router.post("/updateAddress/:id",isAuth, updateAddress);
router.get("/setDefault/:id",isAuth, setDefaultAddress);
router.post("/deleteAddress/:id", isAuth, deleteAddress);

router.get('/shop',loadshop);


router.use((req,res)=>{
   res.redirect('/user/register');
});



export default router;






