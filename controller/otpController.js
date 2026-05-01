import bcrypt from 'bcrypt';
import userSchema from '../model/userModel.js';
import { sendOtpMail } from '../services/mailService.js';

export const loadOtpPage = (req,res)=>{
   if(!req.session.userData){
      return res.redirect('/user/register');
   }
   const email = req.session.userData.email;

   let remaining = Math.floor(
      (req.session.otpExpiry - Date.now()) / 1000
   );

   if(remaining < 0) remaining = 0;

   res.render('user/otp',{
   email,
   remaining,
   formAction:'/user/verifyOtp'
});
}

export const verifyOtp = async (req,res)=>{
     try{

   const {otp} = req.body;

   if (Date.now() > req.session.otpExpiry) {
  const email = req.session.userData?.email;

 return res.render("user/otp", { email, remaining: 0, message: "OTP expired. Please resend OTP."});
}
console.log("Entered OTP:", otp);
console.log("Session OTP:", req.session.otp);
console.log(typeof otp, typeof req.session.otp);
   if(otp.trim() === String(req.session.otp)){
     const data = req.session.userData;
     const hashedPassword = await bcrypt.hash(data.password,10);

     await userSchema.create({
       name:data.name,
       email:data.email,
       password:hashedPassword
    });

     req.session.userData = null;
     req.session.otp = null;
     req.session.otpExpiry = null;

    return res.redirect("/user/login?message=Registration completed&success=true");   }

   const email = req.session.userData?.email;

        let remaining = Math.floor((req.session.otpExpiry - Date.now()) / 1000);

        if(remaining < 0) remaining = 0;
    console.log(otp)
        return res.render("user/otp", {email,remaining,message: "Invalid OTP"});

    }catch(err){
        console.log(err)
        const email = req.session.userData?.email;
        let remaining = 0;
        if(req.session.otpExpiry){
        remaining = Math.floor((req.session.otpExpiry - Date.now()) / 1000);
        if(remaining < 0) remaining = 0; }

     return res.render("user/otp", {email,remaining,message:"Something went wrong"});
}
}

export const resendOtp = async (req,res)=>{
 try{

    
    
    // FORGOT PASSWORD FLOW
    if(req.session.resetEmail){

      const email = req.session.resetEmail;


      const otp = Math.floor(100000 + Math.random()*900000);

      req.session.resetOtp = otp;
      req.session.resetOtpExpiry = Date.now() + 60 * 1000;

      await sendOtpMail(email, otp);

      return res.redirect('/user/forgotOtp');
   }
   // REGISTER FLOW
   if(req.session.userData){

      const email = req.session.userData.email;

      if(Date.now() < req.session.otpExpiry){
         return res.redirect('/user/otp');
      }

      const otp = Math.floor(100000 + Math.random()*900000);

      req.session.otp = otp;
      req.session.otpExpiry = Date.now() + 60 * 1000;

      await sendOtpMail(email, otp);

      return res.redirect('/user/otp');
   }

   return res.redirect('/user/forgotPassword');

 }catch(err){
   console.log(err);
   return res.redirect('/user/forgotPassword');
 }
}

export const loadForgotOtpPage = (req,res)=>{
   if(!req.session.resetEmail){
      return res.redirect('/user/forgotPassword');
   }

   let remaining = Math.floor(
      (req.session.resetOtpExpiry - Date.now()) / 1000
   );

   if(remaining < 0) remaining = 0;

   res.render('user/otp',{
   email:req.session.resetEmail,
   remaining,
   formAction:'/user/verifyForgotOtp'
});
}

export const verifyForgotOtp = (req,res)=>{
   try{
      const { otp } = req.body;

      const email = req.session.resetEmail;

      if(!email){
         return res.render('user/otp',{
            email:req.session.resetEmail,
            remaining:0,
            formAction:'/user/verifyForgotOtp',
            message:'Invalid OTP'
         });
      }

      let remaining = Math.floor(
         (req.session.resetOtpExpiry - Date.now()) / 1000
      );

      if(remaining < 0) remaining = 0;

      if(!otp || otp.trim() === ''){
         return res.render('user/otp',{
            email,
            remaining,
            formAction:'/user/verifyForgotOtp',
            message:"Please enter OTP"
         });
      }

      if(Date.now() > req.session.resetOtpExpiry){
         return res.render('user/otp',{
            email,
            remaining:0,
            formAction:'/user/verifyForgotOtp',
            message:"OTP expired. Please resend OTP"
         });
      }

      if(otp.trim() === String(req.session.resetOtp)){
         req.session.resetVerified = true;
         return res.redirect('/user/resetPassword');
      }

      return res.render('user/otp',{
         email:req.session.resetEmail,
         remaining,
         formAction:'/user/verifyForgotOtp',
         message:"Invalid OTP"
      });

   }catch(err){
      console.log(err);

      return res.render('user/otp',{
         email:req.session.resetEmail,
         remaining:0,
         formAction:'/user/verifyForgotOtp',
         message:"Something went wrong"
      });
   }
}

export const loadAdminOtpPage = (req, res) => {
  if (!req.session.resetEmail) {
    return res.redirect('/admin/forgotPassword');
  }

  let remaining = Math.floor(
    (req.session.resetOtpExpiry - Date.now()) / 1000
  );

  if (remaining < 0) remaining = 0;

  res.render('admin/otp', {
    email: req.session.resetEmail,
    remaining,
    formAction: '/admin/otp'
  });
};

export const verifyAdminForgotOtp = (req, res) => {
   try {
      const { otp } = req.body;
      

    const email = req.session.resetEmail;

    if (!email) {
      return res.redirect('/admin/forgotPassword');
    }

    let remaining = Math.floor(
      (req.session.resetOtpExpiry - Date.now()) / 1000
    );

    if (remaining < 0) remaining = 0;

    if (!otp || otp.trim() === '') {
      return res.render('admin/otp', {
        email,
        remaining,
        formAction: '/admin/otp',
        message: "Please enter OTP"
      });
    }

    if (Date.now() > req.session.resetOtpExpiry) {
      return res.render('admin/otp', {
        email,
        remaining: 0,
        formAction: '/admin/otp',
        message: "OTP expired"
      });
    }

    if (otp.trim() === String(req.session.resetOtp)) {
      req.session.resetVerified = true;
      return res.redirect('/admin/resetPassword');
    }

    return res.render('admin/otp', {
      email,
      remaining,
      formAction: '/admin/otp',
      error: "Invalid OTP"
    });

  } catch (err) {
    console.log(err);
    return res.render('admin/otp', {
      email: req.session.resetEmail,
      remaining: 0,
      formAction: '/admin/otp',
      message: "Something went wrong"
    });
  }
};

export const resendAdminOtp = async (req, res) => {
  try {
    const email = req.session.resetEmail;

    if (!email) {
      return res.redirect('/admin/forgotPassword');
    }
req.session.resetOtp = null;
req.session.resetOtpExpiry = null;
    const otp = Math.floor(100000 + Math.random() * 900000);

    req.session.resetOtp = otp;
    req.session.resetOtpExpiry = Date.now() + 60 * 1000;

    await sendOtpMail(email, otp);

    res.redirect('/admin/otp');

  } catch (err) {
    console.log(err);
    res.redirect('/admin/forgotPassword');
  }
};
