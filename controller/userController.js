import userSchema from '../model/userModel.js';
import bcrypt from 'bcrypt';
import { sendOtpMail } from '../services/mailService.js';

export const loadRegister = async (req,res)=>{
    res.render('user/register',{message:null})
}

export const registerUser = async (req,res)=>{
   
    try{
        const {name,email,password} = req.body
        const user = await userSchema.findOne({email})

        if(user){
            return res.render('user/login',{message:"user already exists"})
        }

        const passwordPattern = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&]).{8,}$/

        if(!passwordPattern.test(password)){
            return res.render('user/register',{message:"Password must be strong (uppercase, lowercase, number, symbol)"})
        }
        if(req.session.otp && req.session.otpExpiry && Date.now() < req.session.otpExpiry){
         return res.redirect('/user/otp');
              }

        const otp =  Math.floor(100000 + Math.random()*900000);
        req.session.otpExpiry = Date.now() + 60 * 1000;
            req.session.userData = { name,email,password };
            req.session.otp = otp;
            req.session.otpExpiry = Date.now() + 60 * 1000;

            await sendOtpMail(email, otp);
            res.redirect("/user/otp");
    }catch(err){
        res.render('user/register',{message:'Something went wrong'})
    }
}

export const loadLogin = async (req,res)=>{
    let message = null
    let success = false

      if(req.query.message){
              message = req.query.message
            }

        if(req.query.success){
             success = true
            }

    res.render('user/login',{message,success})
}

export const login = async (req,res)=>{
    try{
      const {email,password} = req.body
      const user = await userSchema.findOne({email})
        if(!user){
           return res.render('user/login',{message:"User not exists"})
         }
        if(user.isBlocked){
          return  res.render('user/login',{message:"Your account is blocked by the Admin"})
        }
         const isMatch = await bcrypt.compare(password,user.password)

            if(!isMatch){
             return res.render('user/login',{message:"Incorrect password"})
            }

            req.session.user = {
                id:user._id,
                name:user.name
              }

        res.redirect('/user/')

    }catch(err){
       res.render('user/login',{message:"Something went wrong"})
    }
}

export const homePage = async (req,res)=>{
   res.render('user/home',{
      user:req.session.user || null,
      message:req.query.message || null
   });
}

export const logout = (req,res)=>{
  req.session.destroy(()=>{
    res.redirect('/user/?message=Logged out successfully');
  });
}

export const loadForgotPassword = (req,res)=>{
    res.render('user/forgotPassword')
}

export const forgotPassword = async(req,res)=>{
   try{
      const { email } = req.body;

      if(!email){
         return res.render('user/forgotPassword',{message:"Email required"});
      }

      const user = await userSchema.findOne({ email });

      if(!user){
         return res.render('user/forgotPassword',{message:"Email not registered"});
      }

      const otp = Math.floor(100000 + Math.random()*900000);

      req.session.resetEmail = email;
      req.session.resetOtp = otp;
      req.session.resetOtpExpiry = Date.now() + 60000;

      await sendOtpMail(email, otp);

      return res.redirect('/user/forgotOtp');

   }catch(err){
      console.log(err);
      return res.render('user/forgotPassword',{message:"Something went wrong"});
   }
}

export const loadResetPassword = (req,res)=>{
     if(!req.session.resetVerified){
      return res.redirect('/user/forgotPassword');
   }
   res.render('user/resetPassword');
}

export const resetPassword = async(req,res)=>{
   try{

      const { password, confirmPassword } = req.body;

      if(!password || !confirmPassword){
         return res.render('user/resetPassword',{
            message:"All fields required"
         });
      }

      if(password !== confirmPassword){
         return res.render('user/resetPassword',{
            message:"Passwords do not match"
         });
      }

      const passwordPattern =
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&]).{8,}$/;

      if(!passwordPattern.test(password)){
         return res.render('user/resetPassword',{
            message:"Strong password required"
         });
      }

      const hashed = await bcrypt.hash(password,10);

      await userSchema.updateOne(
         { email:req.session.resetEmail },
         { $set:{ password:hashed } }
      );

      req.session.resetEmail = null;
      req.session.resetOtp = null;
      req.session.resetOtpExpiry = null;
      req.session.resetVerified = null;
      return res.redirect(
        '/user/login?message=Password changed successfully&success=true'
      );

   }catch(err){
      console.log(err);

      return res.render('user/resetPassword',{
         message:"Something went wrong"
      });
   }
}





