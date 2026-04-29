import mongoose from 'mongoose'
const userSchema = mongoose.Schema({
    name:{
        type:String,
        required:true,
    },
    email:{
        type: String,
        required:true,
        unique:true,
    },
   password:{
        type:String,
        default:null
    },
    googleId:{
        type:String,
        default:null
    },
     isBlocked:{
        type:Boolean,
        default:false,
    }   
    
})


export default mongoose.model("user",userSchema)