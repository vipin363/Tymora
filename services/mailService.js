import dotenv from "dotenv";
dotenv.config();
import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});


export const sendOtpMail = async (email, otp) => {
   
 try{

   const info = await transporter.sendMail({
     from: process.env.EMAIL_USER,
     to: email,
     subject: "TYMORA OTP Verification",
     text: `Welcome to TYMORA. Your OTP is ${otp}. It expires in 1 minute.`
   });

   console.log("Mail sent:", info.response);

 }catch(err){
   console.log("Mail Error:", err);
   throw err;
 }
};