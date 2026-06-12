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
    },
    walletBalance:{
        type:Number,
        default:0
    },
    referralCode: {
        type: String,
        unique: true,
        sparse: true 
    },
    referredBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'user',
        default: null
    }
 } , { timestamps: true })
    

 

export default mongoose.model("user",userSchema)