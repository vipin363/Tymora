import express from 'express';
const router=express.Router()
import {isAdminLogin,isAdminAuth} from '../middleware/adminAuth.js'
import {loadLogin,login,loadDashboard,logout,loadForgotPassword,forgotPassword,resetAdminPassword,loadUsers,blockUser,unblockUser,deleteUser} from '../controller/adminController.js';
import { loadAdminOtpPage, verifyAdminForgotOtp,resendAdminOtp } from '../controller/otpController.js';


router.get('/login',isAdminLogin,loadLogin)
router.post("/login", login);
router.get("/dashboard", isAdminAuth, loadDashboard);

router.get('/forgotPassword',isAdminLogin,loadForgotPassword)
router.post('/forgotPassword',forgotPassword)

router.get('/otp', (req,res,next)=>{
  if(!req.session.resetEmail){
    return res.redirect('/admin/login');
    }
     next(); },
      loadAdminOtpPage);
router.post('/otp', verifyAdminForgotOtp);
router.post('/resend-otp', resendAdminOtp);
router.get('/resetPassword', (req,res)=>{
  if(!req.session.resetVerified){
    return res.redirect('/admin/forgotPassword');
  }
  res.render('admin/resetPassword');
});
router.post('/resetPassword', resetAdminPassword);

router.get('/users', isAdminAuth, loadUsers);

router.get('/block-user/:id', isAdminAuth, blockUser);
router.get('/unblock-user/:id', isAdminAuth, unblockUser);
router.get('/delete-user/:id', isAdminAuth, deleteUser);

router.get("/logout", logout);



router.use((req,res)=>{
   res.redirect('/admin/login');
});

export default router;

