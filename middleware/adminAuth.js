


export const isLogin=(req,res,next)=>{
    if(req.session.admin){
        res.redirect('/admin/dashBoard')
    }else{
        next()
    }
}

