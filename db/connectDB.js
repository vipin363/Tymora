import mongoose from 'mongoose'

export const connectDB = async () => {
    try{
        const DB_URL= "mongodb://atkvipin_db_user:envptl0a3JaO6ZMl@ac-f0ydhz4-shard-00-00.mydvd0e.mongodb.net:27017,ac-f0ydhz4-shard-00-01.mydvd0e.mongodb.net:27017,ac-f0ydhz4-shard-00-02.mydvd0e.mongodb.net:27017/?ssl=true&replicaSet=atlas-pwskjm-shard-0&authSource=admin&appName=Cluster0"
       // const conn = await mongoose.connect('mongodb://localhost:27017/TYMORA',{});
       const conn = await mongoose.connect(DB_URL)
        console.log(`MongoDB Connected: ${conn.connection.host}`);
    }catch(err){
        console.log(err)
        process.exit(1);
    }
};

