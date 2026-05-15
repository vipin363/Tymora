import userSchema from '../model/userModel.js';
import bcrypt from 'bcrypt';
import cloudinary from "../config/cloudinary.js";
import addressModel from "../model/addressModel.js";
import { generateAndSaveOtp , verifyOtpFromDb} from "../services/otpService.js";
import Category from '../model/categoryModel.js';
import Product from '../model/productModel.js';

export const loadRegister = async (req,res)=>{
    let message = req.query.message || "";
   res.render('user/register', { layout: 'auth', message });
}

export const registerUser = async (req,res)=>{
   
    try{
        const {name,email,password} = req.body
        const user = await userSchema.findOne({email})

       
        if(user){
            return res.render('user/login',{layout: 'auth',message:"user already exists"})
        }
      

        const passwordPattern = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&]).{8,}$/

        if(!passwordPattern.test(password)){
            return res.render('user/register',{layout: 'auth',message:"Password must be strong (uppercase, lowercase, number, symbol)"})
        }


            req.session.userData = { name,email,password };
            await generateAndSaveOtp({ email, purpose: "register" });

req.session.changeEmailLink = "/user/register";  
            res.redirect("/user/otp");
    }catch(err){
        res.render('user/register',{layout: 'auth',message:'Something went wrong'})
    }
}

export const loadLogin = async (req,res)=>{
    let message = null
    let success = false

      if(req.query.message){
              message = req.query.message
            }

        if(req.query.success){
             success = true
            }
             if(req.query.msg === "blocked"){
        message = "Your account has been blocked by admin"
    }

    if(req.query.msg === "deleted"){
        message = "Your account has been deleted by admin"
    }

    res.render('user/login',{layout: 'auth',message,success})
}

export const login = async (req,res)=>{
    try{
      const {email,password} = req.body
      const user = await userSchema.findOne({email})
        if(!user){
           return res.render('user/login',{layout: 'auth',message:"User not exists"})
         }

        if(user.isBlocked){
          return  res.render('user/login',{layout: 'auth',message:"Your account is blocked by the Admin"})
        }

         if(!user.password){
            return res.render('user/login',{layout: 'auth',
            message:"You registered using Google. Please login with Google and set your password in profile or please continue with forgot password."
            })}


         const isMatch = await bcrypt.compare(password,user.password)

            if(!isMatch){
             return res.render('user/login',{layout: 'auth',message:"Incorrect password"})
            }
           

            req.session.user = {
                id:user._id,
                name:user.name
              }

        res.redirect('/user/')

    }catch(err){
       res.render('user/login',{layout: 'auth',message:"Something went wrong"})
    }
}

export const homePage = async (req, res) => {
  try {
    let message = req.query.message || null;

    
    const rawCategories = await Category.find({
      is_visible: true,
      deleted_at: null,
    }).sort({ createdAt: -1 }).lean();

   const navCategories = rawCategories.map(c => ({
    _id: c._id.toString(),  
    name: c.name,
    image: c.image_url || '',
}));

    if (req.session.user) {
      const user = await userSchema.findById(req.session.user.id);

      if (!user) {
        req.session.user = null;
        return res.render('user/home', {
          layout: 'main',
          user: null,
          message: "Your account has been deleted by admin",
          navCategories,
          categories: navCategories,
        });
      }

      if (user.isBlocked) {
        req.session.user = null;
        return res.render('user/home', {
          layout: 'main',
          user: null,
          message: "Your account has been blocked by admin",
          navCategories,
          categories: navCategories,
        });
      }
    }

    res.render('user/home', {
      layout: 'main',
      user:          req.session.user || null,
      message,
      navCategories,       
      categories:    navCategories,  
    });

  } catch (err) {
    console.log(err);
    res.render('user/home', {
      layout: 'main',
      user: null,
      message: "Something went wrong",
      navCategories: [],
      categories: [],
    });
  }
};

export const logout = (req, res) => {
  req.session.user = null;
  res.redirect('/user/?message=Logged out successfully');
};

export const loadForgotPassword = (req,res)=>{
    res.render('user/forgotPassword',{ layout: 'auth' })
}

export const forgotPassword = async(req,res)=>{
   try{
      const { email } = req.body;

      if(!email){
         return res.render('user/forgotPassword',{layout: 'auth',message:"Email required"});
      }

      const user = await userSchema.findOne({ email });

      if(!user){
         return res.render('user/forgotPassword',{layout: 'auth',message:"Email not registered"});
      }
      req.session.userData = null;


      req.session.resetEmail = email;
      
await generateAndSaveOtp({ email, purpose: "forgot_password" });

      req.session.save();
      req.session.changeEmailLink = "/user/forgotPassword";
      return res.redirect('/user/forgotOtp');

   }catch(err){
      console.log(err);
      return res.render('user/forgotPassword',{layout: 'auth',message:"Something went wrong"});
   }
}

export const loadResetPassword = (req,res)=>{
     if(!req.session.resetVerified){
      return res.redirect('/user/forgotPassword');
   }
   res.render('user/resetPassword',{ layout: 'auth' });
}

export const resetPassword = async(req,res)=>{
   try{

      const { password, confirmPassword } = req.body;

      if(!password || !confirmPassword){
         return res.render('user/resetPassword',{layout: 'auth',
            message:"All fields required"
         });
      }

      if(password !== confirmPassword){
         return res.render('user/resetPassword',{layout: 'auth',
            message:"Passwords do not match"
         });
      }

      const passwordPattern =
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&]).{8,}$/;

      if(!passwordPattern.test(password)){
         return res.render('user/resetPassword',{layout: 'auth',
            message:"Strong password required"
         });
      }

      const hashed = await bcrypt.hash(password,10);

      await userSchema.updateOne(
         { email:req.session.resetEmail },
         { $set:{ password:hashed } }
      );

      req.session.resetEmail = null;
      req.session.resetVerified = null;
      return res.redirect(
        '/user/login?message=Password changed successfully&success=true'
      );

   }catch(err){
      console.log(err);

      return res.render('user/resetPassword',{layout: 'auth',
         message:"Something went wrong"
      });
   }
}

export const loadProfile = async (req,res)=>{
   try{

      let user = await userSchema.findById(req.session.user.id).lean();

      if(user?.dob){
         user.dob = new Date(user.dob).toLocaleDateString('en-GB');
      }

      res.render('user/userProfile',{ layout: 'main',user,hasPassword: !!user.password });

   }catch(err){
      console.log(err);
      res.redirect('/user/');
   }
}

export const loadEditProfile = async (req,res)=>{
   try{
      let user = await userSchema.findById(req.session.user.id).lean();
      
     
       if(user.dob){
         user.dob = new Date(user.dob)
         .toISOString()
         .split('T')[0];
      }

      res.render('user/editProfile',{layout: 'main', user });

   }catch(err){
      console.log(err);
      res.redirect('/user/userProfile');
   }
}

export const updateProfile = async (req,res)=>{
   
   try{
      
      const { name, phone, dob, removeAvatar } = req.body || {};
      
      const user = await userSchema.findById(req.session.user.id);
      
      
      const nameRegex = /^[A-Za-z]+(?:\s[A-Za-z]+)*$/;
      
      if(!nameRegex.test(name.trim())){
         return res.render('user/editProfile',{
          layout: 'main',
            user,
            message:"Name must contain only letters and spaces"
         });
      }

   
   const phoneRegex = /^[0-9]{10}$/;
   
   if(!phoneRegex.test(phone)){
    
      return res.render('user/editProfile',{
        layout: 'main',
         user,
         message:"Phone number must be 10 digits"
      });
   }
   
      if(!dob){
         return res.render('user/editProfile',{
          layout: 'main',
            user,
         message:"Date of Birth is required"
      });
   }
   
   const birthDate = new Date(dob);
   const today = new Date();
   
   if(isNaN(birthDate.getTime())){
      return res.render('user/editProfile',{
        layout: 'main',
         user,
         message:"Invalid Date of Birth"
      });
   }
   
   if(birthDate >= today){
      return res.render('user/editProfile',{
        layout: 'main',
         user,
         message:"Date of Birth must be in the past"
      });
   }
   
   if(birthDate.getFullYear() === today.getFullYear()){
      return res.render('user/editProfile',{
        layout: 'main',
         user,
         message:"Birth year cannot be current year"
      });
   }
   
   let age = today.getFullYear() - birthDate.getFullYear();

   if(age < 13){
      return res.render('user/editProfile',{
        layout: 'main',
         user,
         message:"Age must be at least 13 years"
      });
   }
   
   let updateData = {
      name: name.trim(),
      phone: phone.trim(),
      dob: new Date(dob)
   };

   if (removeAvatar === "true") {
   updateData.avatar = null;
   } else if (req.file) {
   updateData.avatar = req.file.path;
   }

   
   await userSchema.findByIdAndUpdate(
      req.session.user.id,
      { $set:updateData },
      { returnDocument:'after' }
   );
   

   req.session.user.name = name.trim();
   res.redirect('/user/profile');

 }catch(err){
   console.log(err);
   res.redirect('/user/editProfile');
 }
}

export const changeEmail = async (req, res) => {
   try {

      const { email } = req.body;
      if (!email) {
         return res.json({ success:false, message:"Email required" });
      }

      const existing = await userSchema.findOne({ email });

      if (existing) {
         return res.json({ success:false, message:"Email already exists" });
      }

      req.session.changeEmail = email;
      
      await generateAndSaveOtp({ email, purpose: "change_email" });

      req.session.save();

      return res.json({ success:true });

   } catch (err) {
      console.log(err);
      return res.json({ success:false, message:"Something went wrong" });
   }
};

export const verifyChangeEmail = async (req, res) => {
   try {

      const { otp } = req.body;
      const result = await verifyOtpFromDb({
  email: req.session.changeEmail,
  otp_code: otp,
  purpose: "change_email"
});

if (!result.success) {
  return res.json({ success: false, message: "Invalid or expired OTP" });
}

await userSchema.findByIdAndUpdate(
  req.session.user.id,
  { email: req.session.changeEmail }
);
req.session.changeEmail = null;
return res.json({ success: true });


   } catch (err) {
       console.log(err);
      return res.json({ success:false, message:"Something went wrong" });
   }
};

export const resendChangeEmailOtp = async (req,res)=>{
   try{

      if(!req.session.changeEmail){
         return res.json({ success:false, message:"Session expired" });
      }

      await generateAndSaveOtp({ email: req.session.changeEmail, purpose: "change_email" });

      
      return res.json({ success:true });

   }catch(err){
      console.log(err);
      return res.json({ success:false });
   }
};

export const deleteAccount = async (req, res) => {
  try {
   console.log("BODY:", req.body);

    const { confirmText } = req.body;

    if (confirmText !== "DELETE") {
      return res.redirect('/user/profile');
    }

    const userId = req.session.user.id;

    const user = await userSchema.findById(userId);

    if(user?.avatar){
      const publicId = user.avatar.split('/').pop().split('.')[0];
      await cloudinary.uploader.destroy("tymora/users/" + publicId);
    }
    await userSchema.findByIdAndDelete(userId);

    req.session.user = null;
res.redirect('/user/home?message=Account deleted successfully');

  } catch (err) {
    console.log(err);
    res.redirect('/user/profile');
  }
};

export const changePassword = async (req,res)=>{
  try{

   const { currentPassword, newPassword, confirmPassword } = req.body;
   const user = await userSchema.findById(req.session.user.id);

      if(!user.password){

            if(!newPassword || !confirmPassword){
                  return res.json({ success:false, message:"All fields required" });
                  }

            const passwordPattern =/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&]).{8,}$/;

            if(!passwordPattern.test(newPassword)){
                 return res.json({ success:false, message:"Weak password" });
                  }

             if(newPassword !== confirmPassword){
                return res.json({ success:false, message:"Passwords do not match" });
                  }

            const hashed = await bcrypt.hash(newPassword,10);

           user.password = hashed;
await user.save();

req.session.user = {
  id: user._id,
  name: user.name
};


                return res.json({ success:true });
    }

    
     
if(!currentPassword || !newPassword || !confirmPassword){
  return res.json({ success:false, message:"All fields required" });
}

const passwordPattern =
/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&]).{8,}$/;

if(!passwordPattern.test(newPassword)){
  return res.json({ success:false, message:"Weak password" });
}


if(currentPassword === newPassword){
  return res.json({ success:false, message:"New password must be different" });
}


const isMatch = await bcrypt.compare(currentPassword, user.password);

if(!isMatch){
  return res.json({ success:false, message:"Current password incorrect" });
}
if(newPassword !== confirmPassword){
  return res.json({ success:false, message:"Passwords do not match" });
}


const hashed = await bcrypt.hash(newPassword,10);

user.password = hashed;
await user.save();

req.session.user = {
  id: user._id,
  name: user.name
};



return res.json({ success:true });
  }catch(err){
    console.log(err);
    return res.json({ success:false, message:"Something went wrong" });
  }
};

export const loadAddressPage = async (req,res)=>{
  try{

    const userId = req.session.user.id;
    const addresses = await addressModel.find({ userId });
    res.render('user/myAddress',{layout: 'main', addresses });

  }catch(err){
    console.log(err);
    res.redirect('/user/profile');
  }
};

export const addAddress = async (req,res)=>{
  try{

   console.log("BODY:", req.body);

    const userId = req.session.user.id;

    const {
      type,
      fullName,
      street,
      city,
      state,
      pincode,
      phone,
      isDefault
    } = req.body;

   
    if(!type || !fullName || !street || !city || !state || !pincode || !phone){
      return res.json({ success:false, message:"All fields required" });
    }

    if(!/^[0-9]{10}$/.test(phone)){
      return res.json({ success:false, message:"Invalid phone number" });
    }

    if(!/^[0-9]{6}$/.test(pincode)){
      return res.json({ success:false, message:"Invalid pincode" });
    }

    
    if(isDefault){
      await addressModel.updateMany({ userId }, { isDefault:false });
    }

    await addressModel.create({
      userId,
      type,
      fullName,
      street,
      city,
      state,
      pincode,
      phone,
      isDefault
    });

    res.json({ success:true });

  }catch(err){
    console.log(err);
    res.json({ success:false, message:"Failed to add address" });
  }
};

export const getAddress = async (req,res)=>{
  try{
    const address = await addressModel.findById(req.params.id);
    res.json({ success:true, address });
  }catch(err){
    res.json({ success:false });
  }
};

export const updateAddress = async (req,res)=>{
  try{

    const { fullName, phone, street, city, state, pincode, type, isDefault } = req.body;

    if(isDefault){
      await addressModel.updateMany(
        { userId:req.session.user.id },
        { isDefault:false }
      );
    }

    await addressModel.findByIdAndUpdate(req.params.id,{
      fullName, phone, street, city, state, pincode, type, isDefault
    });

    res.json({ success:true });

  }catch(err){
    res.json({ success:false });
  }
};

export const setDefaultAddress = async (req,res)=>{
  try{

    const userId = req.session.user.id;
    const addressId = req.params.id;

    await addressModel.updateMany(
      { userId },
      { isDefault:false }
    );

    await addressModel.findByIdAndUpdate(
      addressId,
      { isDefault:true }
    );

    res.redirect("/user/address");

  }catch(err){
    console.log(err);
    res.redirect("/user/address");
  }
};

export const deleteAddress = async (req,res)=>{
  try{

    await addressModel.findByIdAndDelete(req.params.id);

    res.redirect("/user/address");

  }catch(err){
    console.log(err);
    res.redirect("/user/address");
  }
};

export const loadshop = async (req, res) => {
  try {
    const dbProducts = await Product.find({ 
      status: 'active', 
      deleted_at: null 
    })
    .populate('category')
    .populate('brand')
    .lean();

    // Map your actual field names to what shop.js expects
    const products = dbProducts.map(p => {
      const discountedPrice = p.discount > 0
        ? Math.round(p.price - (p.price * p.discount / 100))
        : p.price;

      return {
        id:       p._id.toString(),
        name:     p.name,
        brand:    p.brand?.name   || 'Unknown',
        price:    discountedPrice,
        oldPrice: p.discount > 0  ? p.price : null,
        rating:   4.5,            // you have no rating field yet
        reviews:  0,              // you have no reviews field yet
        badge:    p.featured      ? 'new'
                : p.discount > 0  ? 'sale'
                : p.dealOfTheDay  ? 'hot'
                : null,
        cat:      (p.category?.name || 'other').toLowerCase(),
        style:    p.gender,       // using gender as style for now
        avail:    p.stock > 0     ? 'instock' : 'outofstock',
        img:      p.images?.[0]   || 'https://images.unsplash.com/photo-1523170335258-f5ed11844a49?w=400&q=80',
      };
    });

    const unique = (arr) => [...new Set(arr.filter(Boolean))];

    const categories = unique(products.map(p => p.cat))
      .map(v => ({ value: v, label: v.charAt(0).toUpperCase() + v.slice(1) }));

    const brands = unique(products.map(p => p.brand.toLowerCase()))
      .map(v => ({
        value: v,
        label: products.find(p => p.brand.toLowerCase() === v)?.brand || v,
      }));

    const styles = unique(products.map(p => p.style))
      .map(v => ({ value: v, label: v.charAt(0).toUpperCase() + v.slice(1) }));

    const featured = [...products]
      .filter(p => p.badge !== null)
      .sort((a, b) => b.rating - a.rating)
      .slice(0, 4);

    res.render('user/allProducts', {
      layout: 'main',
      user:          req.session.user || null,
      totalProducts: products.length,
      searchPlaceholder: 'Search watches…',

      sortOptions: [
        { value: 'price-asc',  label: 'Price: Low to High' },
        { value: 'price-desc', label: 'Price: High to Low' },
        { value: 'az',         label: 'Name: A – Z' },
        { value: 'za',         label: 'Name: Z – A' },
        { value: 'rating',     label: 'Top Rated' },
        { value: 'newest',     label: 'Newest' },
      ],

      filterOptions: {
        categories,
        brands,
        styles,
        availability: [
          { value: 'instock',    label: 'In Stock' },
          { value: 'outofstock', label: 'Out of Stock' },
          { value: 'sale',       label: 'On Sale' },
          { value: 'new',        label: 'Featured' },
        ],
      },

      featuredSection: {
        title:     "Editor's",
        highlight: 'Picks',
      },

      shopData: { products, featured },
    });

  } catch (err) {
    console.error('loadshop error:', err);
    res.render('user/allProducts', {
      layout: 'main',
      user:          req.session.user || null,
      totalProducts: 0,
      searchPlaceholder: 'Search watches…',
      sortOptions:   [],
      filterOptions: { categories: [], brands: [], styles: [], availability: [] },
      featuredSection: { title: "Editor's", highlight: 'Picks' },
      shopData:      { products: [], featured: [] },
    });
  }
};



