import mongoose from 'mongoose'

export const connectDB = async () => {
    try{
        const conn = await mongoose.connect('mongodb://localhost:27017/TYMORA',{});
        console.log(`MongoDB Connected: ${conn.connection.host}`);
    }catch(err){
        console.log(err)
        process.exit(1);
    }
};

