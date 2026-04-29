import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import userSchema from '../model/userModel.js';

passport.use(new GoogleStrategy({
   clientID: process.env.GOOGLE_CLIENT_ID,
   clientSecret: process.env.GOOGLE_CLIENT_SECRET,
   callbackURL: "http://localhost:3000/user/auth/google/callback"
},
async(accessToken, refreshToken, profile, done)=>{

   let user = await userSchema.findOne({ email: profile.emails[0].value });

   if(!user){
      user = await userSchema.create({
         name: profile.displayName,
         email: profile.emails[0].value,
          googleId: profile.id
      });
   }

   return done(null, user);
}));

passport.serializeUser((user,done)=>{
   done(null,user.id);
});

passport.deserializeUser(async(id,done)=>{
   const user = await userSchema.findById(id);
   done(null,user);
});