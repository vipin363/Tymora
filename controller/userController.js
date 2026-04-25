


export const loadLogin = (req,res)=>{
         res.render('user/login.hbs')
}

export const login = async (req,res) =>{
    try{
        const {email,password} = req.body
        const user= userSchema.findOne({email})

        if(!user){
             return res.render('user/login',{message:'User does not exist'})
        }
        if(user.isBlocked){
            return res.render('user/login',{message:'user is blocked by the Admin'})
        }

        const isMatch = await bcrypt.compare(password,user.password)

    }catch(err){

    }
}


