import express from 'express';
const router=express.Router()
import {isLogin} from '../middleware/adminAuth.js'
import {loadLogin} from '../controller/adminController.js';



router.get('/login',isLogin,loadLogin)




export default router;