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
    avatar:{
        type:String,
        default:null
    },
    phone:{
        type:String,
        default:null
    },
    dob:{
        type:Date,
         default:null
    },
     isBlocked:{
        type:Boolean,
        default:false,
    }
 } , { timestamps: true })
    

 

export default mongoose.model("user",userSchema)