import User from "../model/userModel.js";

export const isLogin=(req,res,next)=>{
    if(req.session.user){
        res.redirect('/user/')
    }else{
        next()
    }
}

export const isAuth = async (req,res,next)=>{
   try{
   if(!req.session.user){
      return res.redirect('/user/login');
   }
   const user = await User.findById(req.session.user.id);

   
    if (!user) {
      req.session.user = null;
      return res.redirect('/user/login?msg=deleted');
    }

  
    if (user.isBlocked) {
      req.session.user = null;
      return res.redirect('/user/login?msg=blocked');
    }

    next();

  } catch (err) {
    console.log(err);
    res.redirect('/user/login');
  }
}

export const hasOtpSession = (req,res,next)=>{
   if(req.session.userData){
      next();
   }else{
      res.redirect('/user/register');
   }
}

export const onlyPublic = (req,res,next)=>{
   next();
}

export const hasForgotSession = (req,res,next)=>{
   if(req.session.resetEmail){
      return next();
   }

   return res.redirect('/user/forgotPassword');
}

export const hasResetVerified = (req,res,next)=>{
   if(req.session.resetVerified){
      next();
   }else{
      return res.redirect('/user/login');
   }
}

