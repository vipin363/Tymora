


export const isLogin=(req,res,next)=>{
    if(req.session.user){
        res.redirect('user/home')
    }else{
        next()
    }
}

