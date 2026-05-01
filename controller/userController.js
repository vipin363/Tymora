import userSchema from '../model/userModel.js';
import bcrypt from 'bcrypt';
import { sendOtpMail } from '../services/mailService.js';
import cloudinary from "../config/cloudinary.js";
import addressModel from "../model/addressModel.js";


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
             if(req.query.msg === "blocked"){
        message = "Your account has been blocked by admin"
    }

    if(req.query.msg === "deleted"){
        message = "Your account has been deleted by admin"
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
      req.session.userData = null;
      req.session.otp = null;
      req.session.otpExpiry = null;

      const otp = Math.floor(100000 + Math.random()*900000);

      req.session.resetEmail = email;
      req.session.resetOtp = otp;
      req.session.resetOtpExpiry = Date.now() + 60000;

      req.session.save();

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

export const loadProfile = async (req,res)=>{
   try{

      let user = await userSchema.findById(req.session.user.id).lean();

      if(user?.dob){
         user.dob = new Date(user.dob).toLocaleDateString('en-GB');
      }

      res.render('user/userProfile',{ user });

   }catch(err){
      console.log(err);
      res.redirect('/user/');
   }
}

export const loadEditProfile = async (req,res)=>{
   try{
      let user = await userSchema.findById(req.session.user.id).lean();
      
     
       if(user.dob){
         user.dob = new Date(user.dob)
         .toISOString()
         .split('T')[0];
      }

      res.render('user/editProfile',{ user });

   }catch(err){
      console.log(err);
      res.redirect('/user/userProfile');
   }
}

export const updateProfile = async (req,res)=>{
   
   try{
      
      const { name, phone, dob, removeAvatar } = req.body || {};
      
      const user = await userSchema.findById(req.session.user.id);
      
      // NAME VALIDATION
      const nameRegex = /^[A-Za-z]+(?:\s[A-Za-z]+)*$/;
      
      if(!nameRegex.test(name.trim())){
         return res.render('user/editProfile',{
            user,
            message:"Name must contain only letters and spaces"
         });
      }

      // PHONE VALIDATION
   const phoneRegex = /^[0-9]{10}$/;
   
   if(!phoneRegex.test(phone)){
      return res.render('user/editProfile',{
         user,
         message:"Phone number must be 10 digits"
      });
   }
   
   // DOB VALIDATION
      if(!dob){
         return res.render('user/editProfile',{
            user,
         message:"Date of Birth is required"
      });
   }
   
   const birthDate = new Date(dob);
   const today = new Date();
   
   if(isNaN(birthDate.getTime())){
      return res.render('user/editProfile',{
         user,
         message:"Invalid Date of Birth"
      });
   }
   
   if(birthDate >= today){
      return res.render('user/editProfile',{
         user,
         message:"Date of Birth must be in the past"
      });
   }
   
   if(birthDate.getFullYear() === today.getFullYear()){
      return res.render('user/editProfile',{
         user,
         message:"Birth year cannot be current year"
      });
   }
   
   // Optional: age minimum 13
   let age = today.getFullYear() - birthDate.getFullYear();

   if(age < 13){
      return res.render('user/editProfile',{
         user,
         message:"Age must be at least 13 years"
      });
   }
   
   
   // UPDATE DB
   let updateData = {
      name: name.trim(),
      phone: phone.trim(),
      dob: new Date(dob)
   };

   if (removeAvatar === "true") {
   updateData.avatar = null;
   } else if (req.file) {
   updateData.avatar = req.file.path;
   }

   
   await userSchema.findByIdAndUpdate(
      req.session.user.id,
      { $set:updateData },
      { returnDocument:'after' }
   );
   

   req.session.user.name = name.trim();
   res.redirect('/user/profile');

 }catch(err){
   console.log(err);
   res.redirect('/user/editProfile');
 }
}

export const changeEmail = async (req, res) => {
   try {

      const { email } = req.body;
      if (!email) {
         return res.json({ success:false, message:"Email required" });
      }

      const existing = await userSchema.findOne({ email });

      if (existing) {
         return res.json({ success:false, message:"Email already exists" });
      }

      const otp = Math.floor(100000 + Math.random()*900000);

      req.session.changeEmail = email;
      req.session.changeOtp = otp;
      req.session.changeOtpExpiry = Date.now() + 60000;
      req.session.save();


      await sendOtpMail(email, otp);

      return res.json({ success:true });

   } catch (err) {
      console.log(err);
      return res.json({ success:false, message:"Something went wrong" });
   }
};

export const verifyChangeEmail = async (req, res) => {
   try {

      const { otp } = req.body;

      if (
         req.session.changeOtp == otp &&
         Date.now() < req.session.changeOtpExpiry
      ) {

         await userSchema.findByIdAndUpdate(
            req.session.user.id,
            { email: req.session.changeEmail }
         );

         // clear session
         req.session.changeEmail = null;
         req.session.changeOtp = null;
         req.session.changeOtpExpiry = null;

         return res.json({ success:true });
      }

      return res.json({ success:false, message:"Invalid OTP" });

   } catch (err) {
       console.log(err);
      return res.json({ success:false, message:"Something went wrong" });
   }
};

export const resendChangeEmailOtp = async (req,res)=>{
   try{

      if(!req.session.changeEmail){
         return res.json({ success:false, message:"Session expired" });
      }

      const otp = Math.floor(100000 + Math.random()*900000);

      req.session.changeOtp = otp;
      req.session.changeOtpExpiry = Date.now() + 60000;

      await sendOtpMail(req.session.changeEmail, otp);

      return res.json({ success:true });

   }catch(err){
      console.log(err);
      return res.json({ success:false });
   }
};

export const deleteAccount = async (req, res) => {
  try {
   console.log("BODY:", req.body);

    const { confirmText } = req.body;

    if (confirmText !== "DELETE") {
      return res.redirect('/user/profile');
    }

    const userId = req.session.user.id;

    const user = await userSchema.findById(userId);

    if(user?.avatar){
      const publicId = user.avatar.split('/').pop().split('.')[0];
      await cloudinary.uploader.destroy("tymora/users/" + publicId);
    }
    await userSchema.findByIdAndDelete(userId);

    req.session.destroy(() => {
      res.redirect('/user/home?message=Account deleted successfully');
    });

  } catch (err) {
    console.log(err);
    res.redirect('/user/profile');
  }
};

export const changePassword = async (req,res)=>{
  try{

    const { currentPassword, newPassword, confirmPassword } = req.body;

    const user = await userSchema.findById(req.session.user.id);

    // 1. required
    if(!currentPassword || !newPassword || !confirmPassword){
      return res.json({ success:false, message:"All fields required" });
    }

    // 2. check current password
    const isMatch = await bcrypt.compare(currentPassword, user.password);

    if(!isMatch){
      return res.json({ success:false, message:"Current password incorrect" });
    }

    // 3. match new password
    if(newPassword !== confirmPassword){
      return res.json({ success:false, message:"Passwords do not match" });
    }

    // 4. strong password
    const passwordPattern =
    /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&]).{8,}$/;

    if(!passwordPattern.test(newPassword)){
      return res.json({ success:false, message:"Weak password" });
    }

    // 5. same password check
    if(currentPassword === newPassword){
      return res.json({ success:false, message:"New password must be different" });
    }

    // 6. hash
    const hashed = await bcrypt.hash(newPassword,10);

    await userSchema.findByIdAndUpdate(user._id,{
      $set:{ password:hashed }
    });

    return res.json({ success:true });

  }catch(err){
    console.log(err);
    return res.json({ success:false, message:"Something went wrong" });
  }
};

export const loadAddressPage = async (req,res)=>{
  try{

    const userId = req.session.user.id;
    const addresses = await addressModel.find({ userId });
    res.render('user/myAddress',{ addresses });

  }catch(err){
    console.log(err);
    res.redirect('/user/profile');
  }
};

export const addAddress = async (req,res)=>{
  try{

   console.log("BODY:", req.body);

    const userId = req.session.user.id;

    const {
      type,
      fullName,
      street,
      city,
      state,
      pincode,
      phone,
      isDefault
    } = req.body;

    // VALIDATION
    if(!type || !fullName || !street || !city || !state || !pincode || !phone){
      return res.json({ success:false, message:"All fields required" });
    }

    if(!/^[0-9]{10}$/.test(phone)){
      return res.json({ success:false, message:"Invalid phone number" });
    }

    if(!/^[0-9]{6}$/.test(pincode)){
      return res.json({ success:false, message:"Invalid pincode" });
    }

    // DEFAULT LOGIC
    if(isDefault){
      await addressModel.updateMany({ userId }, { isDefault:false });
    }

    await addressModel.create({
      userId,
      type,
      fullName,
      street,
      city,
      state,
      pincode,
      phone,
      isDefault
    });

    res.json({ success:true });

  }catch(err){
    console.log(err);
    res.json({ success:false, message:"Failed to add address" });
  }
};

export const getAddress = async (req,res)=>{
  try{
    const address = await addressModel.findById(req.params.id);
    res.json({ success:true, address });
  }catch(err){
    res.json({ success:false });
  }
};

export const updateAddress = async (req,res)=>{
  try{

    const { fullName, phone, street, city, state, pincode, type, isDefault } = req.body;

    if(isDefault){
      await addressModel.updateMany(
        { userId:req.session.user.id },
        { isDefault:false }
      );
    }

    await addressModel.findByIdAndUpdate(req.params.id,{
      fullName, phone, street, city, state, pincode, type, isDefault
    });

    res.json({ success:true });

  }catch(err){
    res.json({ success:false });
  }
};

export const setDefaultAddress = async (req,res)=>{
  try{

    const userId = req.session.user.id;
    const addressId = req.params.id;

    // ❌ remove all default
    await addressModel.updateMany(
      { userId },
      { isDefault:false }
    );

    // ✅ set selected as default
    await addressModel.findByIdAndUpdate(
      addressId,
      { isDefault:true }
    );

    res.redirect("/user/address");

  }catch(err){
    console.log(err);
    res.redirect("/user/address");
  }
};

export const deleteAddress = async (req,res)=>{
  try{

    await addressModel.findByIdAndDelete(req.params.id);

    res.redirect("/user/address");

  }catch(err){
    console.log(err);
    res.redirect("/user/address");
  }
};