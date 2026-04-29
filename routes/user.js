import express  from 'express';
const router=express.Router()
import { isLogin,isAuth,hasOtpSession,hasForgotSession,hasResetVerified } from '../middleware/userAuth.js';
import { loadLogin,login,loadRegister,registerUser,homePage,logout,loadForgotPassword,forgotPassword,loadResetPassword,resetPassword } from '../controller/userController.js';
import { loadOtpPage,verifyOtp,resendOtp,loadForgotOtpPage,verifyForgotOtp } from '../controller/otpController.js';
import  passport from 'passport';

// router.get('/', (req,res)=>{
//     if(req.session.user){
//         res.redirect('/user/home')
//     }else{
//         res.redirect('/user/login')
//     }
// })

router.get('/', homePage);

router.get('/login',isLogin,loadLogin)
router.post('/login',login)

router.get('/register',isLogin,loadRegister)
router.post('/register',registerUser)

router.get('/otp',hasOtpSession,loadOtpPage)
router.post('/verifyOtp',hasOtpSession,verifyOtp)
router.get('/resendOtp',hasOtpSession,resendOtp);

// router.get('/home',isAuth,homePage)

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

router.get('/auth/google',passport.authenticate('google',{ scope:['profile','email'] }));

router.get('/auth/google/callback',passport.authenticate('google',{failureRedirect:'/user/login'}),
(req,res)=>{
   req.session.user = {
      id:req.user._id,
      name:req.user.name
   };
res.redirect('/user/home');
});

router.use((req,res)=>{
   res.redirect('/user/');
});



export default router;






