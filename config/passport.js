import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import userSchema from '../model/userModel.js';

passport.use(new GoogleStrategy({
   clientID: process.env.GOOGLE_CLIENT_ID,
   clientSecret: process.env.GOOGLE_CLIENT_SECRET,
   callbackURL: "http://localhost:3000/user/auth/google/callback",
   passReqToCallback: true  
},
async(req, accessToken, refreshToken, profile, done)=>{

   try {
      const email = profile.emails[0].value;
      let user = await userSchema.findOne({ email });

      const isRegister = req.session.googleAuthType === 'register';

      if (!isRegister) {

         if (!user) {
            return done(null, false, { message: "User not found" });
         }

         if (user.isBlocked) {
            return done(null, false, { message: "Account blocked" });
         }

         return done(null, user);
      }
      else {

         if (user) {
            return done(null, false, { message: "User already exists" });
         }

         user = await userSchema.create({
            name: profile.displayName,
            email,
            googleId: profile.id
         });

         return done(null, user);
      }

   } catch (err) {
      return done(err, null);
   }
}));