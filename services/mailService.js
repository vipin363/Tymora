import dotenv from "dotenv";
dotenv.config();
import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL,
    pass: process.env.APP_PASSWORD
  }
});


export const sendOtpMail = async (email, otp) => {
 
 try{
   const info = await transporter.sendMail({
     from: `"TYMORA" <${process.env.EMAIL}>`,
     to: email,
     subject: "TYMORA OTP Verification",
     text: `Welcome to TYMORA. Your OTP is ${otp}. It expires in 1 minute.`,
     html: `
       <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;background:#0a0a0a;color:#fff;padding:32px;border-radius:8px;border:1px solid #222;">
         <div style="text-align:center;margin-bottom:24px;">
           <span style="font-family:'Georgia',serif;font-size:26px;color:#c9a84c;letter-spacing:4px;">TYMORA</span>
         </div>
         <p style="color:#aaa;font-size:14px;margin-bottom:8px;">Your one-time verification code</p>
         <div style="background:#111;border:1px solid #c9a84c;border-radius:8px;padding:20px;text-align:center;margin:20px 0;">
           <span style="font-size:36px;font-weight:700;letter-spacing:12px;color:#c9a84c;">${otp}</span>
         </div>
         <p style="color:#aaa;font-size:13px;">This code expires in <strong style="color:#fff;">1 minute</strong>. Do not share it with anyone.</p>
         <hr style="border-color:#222;margin:24px 0;">
         <p style="color:#555;font-size:11px;text-align:center;">© TYMORA. If you didn't request this, please ignore this email.</p>
       </div>
     `
   });

   console.log("Mail sent:", info.response);

 }catch(err){
   console.log("Mail Error:", err);
   throw err;
 }
};


