

export const isLogin=(req,res,next)=>{
    if(req.session.user){
        res.redirect('/user/')
    }else{
        next()
    }
}

export const isAuth = (req,res,next)=>{
   if(req.session.user){
      next();
   }else{
      return res.redirect('/user/login');
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
      next();
   }else{
      return res.redirect('/user/login');
   }
}

export const hasResetVerified = (req,res,next)=>{
   if(req.session.resetVerified){
      next();
   }else{
      return res.redirect('/user/login');
   }
}

